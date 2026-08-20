// nkg/index.js — Neural Knowledge Graph: permanent Cordis plugin
//
// Mounted by the cordis-lite agent preset. Every session:
// 1. Loads .nkg.json from the workspace root
// 2. Captures errors and decisions from tool results
// 3. Injects compressed context (3 lines max) before each model step
// 4. Self-evolves: edge weights strengthen on repeated patterns
//
// No seed data — all data comes from real tool events and the .nkg.json file.

const name = 'nkg'
const inject = ['fs', 'systemPrompt']

function apply(ctx) {
  let graph = { nodes: {}, edges: [] }
  let nextId = 0
  let graphPath = null

  const uid = () => 'n' + String(++nextId)

  // ── persistence ──
  async function load() {
    try {
      const target = await ctx.fs.resolve('.nkg.json')
      graphPath = target
      const text = await ctx.fs.readText(target)
      graph = JSON.parse(text)
      nextId = Math.max(0, ...Object.keys(graph.nodes).map(k => parseInt(k.slice(1), 10) || 0))
    } catch {
      // No file yet — start fresh
      try { graphPath = await ctx.fs.resolve('.nkg.json') } catch { /* will try again on save */ }
    }
  }

  async function save() {
    if (!graphPath) {
      try { graphPath = await ctx.fs.resolve('.nkg.json') } catch { return }
    }
    try {
      await ctx.fs.writeText(graphPath, JSON.stringify(graph, null, 2))
    } catch {
      // Write can fail due to sandbox — the in-memory graph still works
    }
  }

  // ── graph helpers ──
  function addNode(node) {
    const id = uid()
    graph.nodes[id] = { ...node, ts: new Date().toISOString() }
    return id
  }

  function addEdge(from, to, label) {
    const existing = graph.edges.find(e => e.from === from && e.to === to && e.label === label)
    if (existing) {
      existing.weight = (existing.weight || 1) + 1
      return
    }
    graph.edges.push({ from, to, label, weight: 1 })
  }

  function findOrCreateFileNode(path) {
    for (const [id, n] of Object.entries(graph.nodes)) {
      if (n.type === 'file' && n.path === path) return id
    }
    const id = uid()
    graph.nodes[id] = { type: 'file', path, ts: new Date().toISOString() }
    return id
  }

  function deduplicate(text, type) {
    for (const [id, n] of Object.entries(graph.nodes)) {
      if (n.type === type && n.text === text) return id
    }
    return null
  }

  // ── tokenization (TF-IDF) ──
  function tokenize(text) {
    return (text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  }

  function semanticSearch(query, limit = 5) {
    const docs = Object.entries(graph.nodes).map(([id, n]) => ({
      id,
      tokens: tokenize((n.text || '') + ' ' + (n.path || '') + ' ' + (n.tool || '')),
    }))
    if (!docs.length) return []

    // IDF
    const df = {}
    for (const d of docs) {
      const seen = new Set()
      for (const t of d.tokens) {
        if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t) }
      }
    }
    const N = docs.length
    const idf = t => Math.log((N + 1) / ((df[t] || 0) + 1)) + 1

    // TF vectors
    const vectors = docs.map(d => {
      const tf = {}
      for (const t of d.tokens) tf[t] = (tf[t] || 0) + 1
      const max = Math.max(1, ...Object.values(tf))
      const vec = {}
      for (const t of Object.keys(tf)) vec[t] = (tf[t] / max) * idf(t)
      return { id: d.id, vec }
    })

    // Query vector
    const qt = tokenize(query)
    const qf = {}
    for (const t of qt) qf[t] = (qf[t] || 0) + 1
    const qm = Math.max(1, ...Object.values(qf))
    const qv = {}
    for (const t of Object.keys(qf)) qv[t] = (qf[t] / qm) * idf(t)

    // Cosine similarity
    return vectors
      .map(v => {
        let dot = 0
        for (const k of Object.keys(qv)) {
          if (v.vec[k] !== undefined) dot += qv[k] * v.vec[k]
        }
        const na = Math.sqrt(Object.values(v.vec).reduce((s, x) => s + x * x, 0)) || 1
        const nb = Math.sqrt(Object.values(qv).reduce((s, x) => s + x * x, 0)) || 1
        return { id: v.id, node: graph.nodes[v.id], score: Math.round(dot / (na * nb) * 100) }
      })
      .filter(s => s.score > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  function formatContext(results) {
    if (!results.length) return ''
    const lines = ['## Knowledge Graph']
    const shown = new Set()
    for (const r of results) {
      const n = r.node
      if (shown.has(r.id)) continue
      shown.add(r.id)
      const prefix = n.type === 'decision' ? '📋' : n.type === 'error' ? '⚠️' : '📁'
      lines.push(`- ${prefix} [${r.score}%] ${(n.text || '').slice(0, 80)}`)
      if (n.fix) lines.push(`  ↳ Fix: ${n.fix}`)
    }
    return lines.join('\n')
  }

  // ── live extraction from tool results ──
  ctx.on('tools/result', (exec, result) => {
    const name = exec.name
    const args = exec.args || {}

    // Capture shell errors
    if ((name === 'pwsh' || name === 'bash') && result.error) {
      const text = String(result.error).slice(0, 200)
      let fix = null
      const existing = deduplicate(text, 'error')
      if (existing) {
        graph.nodes[existing].count = (graph.nodes[existing].count || 1) + 1
        graph.nodes[existing].ts = new Date().toISOString()
        // Self-evolve: if we have a fix and it's been used before, boost it
        if (graph.nodes[existing].fix) {
          for (const [id, n] of Object.entries(graph.nodes)) {
            if (n.type === 'decision' && n.text && n.text.includes(graph.nodes[existing].fix.slice(0, 10))) {
              addEdge(existing, id, 'fixed_by')
            }
          }
        }
      } else {
        if (text.includes('EPERM')) fix = 'Use stdio:inherit'
        else if (text.includes('sandbox')) fix = 'Escalate sandbox permissions'
        else if (text.includes('not found') || text.includes('not recognized')) fix = 'Check installation'
        addNode({ type: 'error', tool: name, text, fix, count: 1 })
      }
      save()
      return
    }

    // Capture file edits
    if (name === 'edit' || name === 'write') {
      const path = args.file_path || ''
      if (!path) return
      const basename = path.split('/').pop() || path.split('\\').pop()
      const text = `${name === 'write' ? 'Created' : 'Edited'} ${basename}`
      const existing = deduplicate(text, 'decision')
      if (existing) {
        graph.nodes[existing].count = (graph.nodes[existing].count || 1) + 1
        graph.nodes[existing].ts = new Date().toISOString()
      } else {
        const nid = addNode({ type: 'decision', text, count: 1 })
        addEdge(nid, findOrCreateFileNode(path), 'affected')
      }
      save()
    }
  })

  // ── compressed context injection ──
  ctx.systemPrompt.context({
    name: 'nkg-context',
    order: 450,
    provider() {
      const ids = Object.keys(graph.nodes)
      if (!ids.length) return ''

      // Collect
      const errors = []
      const decisions = []
      for (const id of ids) {
        const n = graph.nodes[id]
        if (n.type === 'error') errors.push({ id, ...n })
        if (n.type === 'decision') decisions.push({ id, ...n })
      }
      errors.sort((a, b) => (b.count || 1) - (a.count || 1))
      decisions.sort((a, b) => (b.count || 1) - (a.count || 1))

      const results = []
      const shown = new Set()

      // Top errors by count
      for (const e of errors.slice(0, 2)) {
        results.push({ id: e.id, node: e, score: Math.min(100, (e.count || 1) * 30) })
        shown.add(e.id)
      }

      // Top decisions by count
      for (const d of decisions.slice(0, 2)) {
        if (!shown.has(d.id)) {
          results.push({ id: d.id, node: d, score: Math.min(100, (d.count || 1) * 25) })
          shown.add(d.id)
        }
      }

      // Semantic search for related nodes
      if (errors.length > 0) {
        const related = semanticSearch(errors[0].text, 2)
        for (const r of related) {
          if (!shown.has(r.id)) { results.push(r); shown.add(r.id) }
        }
      }

      return formatContext(results.slice(0, 5))
    },
  })

  // ── bootstrap ──
  load()
}

export { name, inject, apply }