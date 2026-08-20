// nkg.js — Neural Knowledge Graph v2 Dynamic Cordis Plugin
//
// Deploy: cordis_define with plugin.kind "new", idPrefix "nkg"
//         cordis_run after define
//
// Stores graph as nkg.json in the session workspace.
// Captures errors from shell tools and decisions from file edits.
// v2 adds: TF-IDF semantic retrieval, Jaccard deduplication,
//          edge weighting, frequency-based context injection.

return {
  apply(ctx) {
    const sp = ctx.get('systemPrompt')
    const fs = ctx.get('fs')
    if (sp === undefined || fs === undefined) return

    const GRAPH_PATH = 'nkg.json'
    let graph = { nodes: {}, edges: [] }
    let nextId = 0
    const uid = () => 'n' + String(++nextId)

    // ── persistence ──
    async function load() {
      try {
        const target = await fs.resolve(GRAPH_PATH)
        const text = await fs.readText(target)
        graph = JSON.parse(text)
        nextId = Math.max(0, ...Object.keys(graph.nodes).map(k => parseInt(k.slice(1), 10) || 0))
        console.log('NKG v2 loaded:', Object.keys(graph.nodes).length, 'nodes,', graph.edges.length, 'edges')
      } catch (_) {
        console.log('NKG v2: fresh start')
      }
    }

    async function save() {
      try {
        const target = await fs.resolve(GRAPH_PATH)
        await fs.writeText(target, JSON.stringify(graph, null, 2))
      } catch (_) {}
    }

    function addNode(node) {
      const id = uid()
      graph.nodes[id] = { ...node, ts: new Date().toISOString() }
      return id
    }

    function findOrCreateFileNode(path) {
      for (const [id, node] of Object.entries(graph.nodes)) {
        if (node.type === 'file' && node.path === path) return id
      }
      const id = uid()
      graph.nodes[id] = { type: 'file', path: path, ts: new Date().toISOString() }
      return id
    }

    // ── TF-IDF vectorizer (zero dependencies) ──
    function tokenize(text) {
      return (text || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1)
    }

    function buildTfIdf(query) {
      const docs = Object.entries(graph.nodes).map(([id, n]) => ({
        id,
        tokens: tokenize((n.text || '') + ' ' + (n.path || '') + ' ' + (n.tool || '')),
      }))
      if (docs.length === 0) return { vectors: [], queryVec: [] }

      const df = {}
      for (const d of docs) {
        const seen = new Set()
        for (const t of d.tokens) {
          if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t) }
        }
      }
      const N = docs.length

      function idf(t) { return Math.log((N + 1) / ((df[t] || 0) + 1)) + 1 }

      const vectors = docs.map(d => {
        const tf = {}
        for (const t of d.tokens) tf[t] = (tf[t] || 0) + 1
        const maxTf = Math.max(1, ...Object.values(tf))
        const vec = {}
        for (const t of Object.keys(tf)) vec[t] = (tf[t] / maxTf) * idf(t)
        return { id: d.id, vec, norm: Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0)) }
      })

      const qTokens = tokenize(query)
      const qTf = {}
      for (const t of qTokens) qTf[t] = (qTf[t] || 0) + 1
      const qMax = Math.max(1, ...Object.values(qTf))
      const queryVec = {}
      for (const t of Object.keys(qTf)) queryVec[t] = (qTf[t] / qMax) * idf(t)

      return { vectors, queryVec }
    }

    function cosineSim(a, b) {
      let dot = 0
      for (const k of Object.keys(a)) { if (b[k] !== undefined) dot += a[k] * b[k] }
      const na = Math.sqrt(Object.values(a).reduce((s, v) => s + v * v, 0)) || 1
      const nb = Math.sqrt(Object.values(b).reduce((s, v) => s + v * v, 0)) || 1
      return dot / (na * nb)
    }

    function semanticSearch(query, limit) {
      limit = limit || 5
      const { vectors, queryVec } = buildTfIdf(query)
      if (vectors.length === 0) return []

      const scored = vectors
        .map(v => ({ id: v.id, score: cosineSim(queryVec, v.vec) }))
        .filter(s => s.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      return scored.map(s => ({
        id: s.id,
        node: graph.nodes[s.id],
        score: Math.round(s.score * 100),
      }))
    }

    function formatContext(results) {
      if (results.length === 0) return ''
      const lines = ['## Knowledge Graph (semantic retrieval)']
      for (const r of results) {
        const n = r.node
        const prefix = n.type === 'decision' ? '📋' : n.type === 'error' ? '⚠️' : '📁'
        lines.push(`- ${prefix} [${r.score}%] ${n.text}`)
        if (n.fix) lines.push(`  Fix: ${n.fix}`)
        for (const e of graph.edges) {
          if (e.from === r.id && graph.nodes[e.to]?.type === 'file') {
            lines.push(`  File: ${graph.nodes[e.to].path}`)
          }
        }
      }
      return lines.join('\n')
    }

    // ── Jaccard deduplication ──
    function deduplicate(newText, nodeType) {
      for (const [id, node] of Object.entries(graph.nodes)) {
        if (node.type === nodeType && node.text === newText) return id
      }
      const newTokens = new Set(tokenize(newText))
      for (const [id, node] of Object.entries(graph.nodes)) {
        if (node.type !== nodeType) continue
        const existing = new Set(tokenize(node.text))
        let overlap = 0
        for (const t of newTokens) { if (existing.has(t)) overlap++ }
        const jaccard = overlap / Math.max(1, new Set([...newTokens, ...existing]).size)
        if (jaccard > 0.7) return id
      }
      return null
    }

    // ── edge weighting ──
    function boostEdge(from, to, label) {
      const existing = graph.edges.find(e => e.from === from && e.to === to && e.label === label)
      if (existing) {
        existing.weight = (existing.weight || 1) + 1
        return
      }
      graph.edges.push({ from, to, label, weight: 1 })
    }

    // ── extractors ──
    ctx.on('tools/result', (exec, result) => {
      const name = exec.name
      const args = exec.args || {}

      if ((name === 'pwsh' || name === 'bash') && result.error) {
        const errText = String(result.error).slice(0, 200)
        const dup = deduplicate(errText, 'error')
        if (dup) {
          graph.nodes[dup].count = (graph.nodes[dup].count || 1) + 1
          graph.nodes[dup].ts = new Date().toISOString()
        } else {
          const cmd = args.command || ''
          const fileMatch = cmd.match(/([\\/][\w.\-\/]+\\.[a-z]{1,6})/i)
          let fix = null
          if (errText.includes('EPERM')) fix = 'Use stdio: inherit instead of pipe'
          else if (errText.includes('sandbox')) fix = 'Check sandbox permissions'
          else if (errText.includes('not found') || errText.includes('not recognized')) fix = 'Verify command/package is installed'

          const id = addNode({ type: 'error', tool: name, text: errText, fix, count: 1 })
          if (fileMatch) boostEdge(id, findOrCreateFileNode(fileMatch[1]), 'errored_in')
        }
        save()
        return
      }

      if (name === 'edit' || name === 'write') {
        const filePath = args.file_path || ''
        if (!filePath) return
        const basename = filePath.split('/').pop() || filePath.split('\\').pop()
        const text = `${name === 'write' ? 'Created' : 'Edited'} ${basename}`
        const dup = deduplicate(text, 'decision')
        if (dup) {
          graph.nodes[dup].count = (graph.nodes[dup].count || 1) + 1
          graph.nodes[dup].ts = new Date().toISOString()
        } else {
          const id = addNode({ type: 'decision', text, count: 1 })
          boostEdge(id, findOrCreateFileNode(filePath), 'affected')
        }
        save()
      }
    })

    // ── semantic + frequency context injection ──
    sp.context({
      name: 'nkg-context',
      order: 500,
      provider: () => {
        if (Object.keys(graph.nodes).length === 0) return ''

        const allErrors = Object.entries(graph.nodes)
          .filter(([_, n]) => n.type === 'error')
          .sort((a, b) => (b[1].count || 1) - (a[1].count || 1))

        const allDecisions = Object.entries(graph.nodes)
          .filter(([_, n]) => n.type === 'decision')
          .sort((a, b) => (b[1].count || 1) - (a[1].count || 1))

        const results = []
        const seen = new Set()

        for (const [id, n] of allErrors.slice(0, 3)) {
          results.push({ id, node: n, score: Math.min(100, (n.count || 1) * 30) })
          seen.add(id)
        }

        for (const [id, n] of allDecisions.slice(0, 3)) {
          if (!seen.has(id)) {
            results.push({ id, node: n, score: Math.min(100, (n.count || 1) * 25) })
            seen.add(id)
          }
        }

        if (allErrors.length > 0) {
          const semantic = semanticSearch(allErrors[0][1].text, 2)
          for (const s of semantic) {
            if (!seen.has(s.id)) {
              results.push(s)
              seen.add(s.id)
            }
          }
        }

        return formatContext(results.slice(0, 6))
      },
    })

    // ── bootstrap ──
    load()
  },
}