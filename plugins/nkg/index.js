// nkg/index.js — Neural Knowledge Graph v9: self-evolving, git-aware
//
// Mounted by the cordis-lite agent preset. Every session:
// 1. Finds the git repo root (if any) and loads .git/nkg.json
// 2. Captures errors, decisions, and file edits from tool results
// 3. Injects a compressed context snapshot (computed once per session so the
//    system-prompt prefix stays stable and the request cache keeps hitting)
// 4. Self-evolves: edge decay on unused connections, fix re-use boosts
//
// The graph follows the repo — same graph whether you cd into a subdirectory,
// clone to a new machine, or switch branches.
//
// No seed data. All data comes from real tool events.

const name = 'nkg'
const inject = ['fs', 'systemPrompt']

function apply(ctx) {
  let graph = { nodes: {}, edges: [] }
  let nextId = 0
  let graphPath = null
  let gitRoot = null
  let contextSnapshot = null

  const uid = () => 'n' + String(++nextId)

  // ── find git root ──
  async function findGitRoot() {
    try {
      // Walk up from the workspace one level at a time looking for .git
      let prefix = ''
      for (let i = 0; i < 10; i++) {
        try {
          const gitDir = await ctx.fs.resolve(prefix + '.git')
          const stat = await ctx.fs.stat(gitDir)
          if (stat) {
            gitRoot = prefix
            return
          }
        } catch { /* .git not here, go up */ }
        prefix += '../'
      }
    } catch {
      // No git repo — use workspace .nkg.json as fallback
    }
  }

  async function load() {
    await findGitRoot()

    if (gitRoot !== null) {
      // Git-aware: store in .git/nkg.json (gitignored by default)
      graphPath = await ctx.fs.resolve(gitRoot + '.git/nkg.json')
    } else {
      // Fallback: store in workspace root
      graphPath = await ctx.fs.resolve('.nkg.json')
    }

    try {
      const text = await ctx.fs.readText(graphPath)
      graph = JSON.parse(text)
      if (!graph.nodes) graph.nodes = {}
      if (!graph.edges) graph.edges = []
      nextId = Math.max(0, ...Object.keys(graph.nodes).map(k => parseInt(k.slice(1), 10) || 0))
    } catch {
      // No file yet — start fresh
    }
  }

  async function save() {
    if (!graphPath) return
    try {
      await ctx.fs.writeText(graphPath, JSON.stringify(graph, null, 2))
    } catch {
      // Write can fail due to sandbox — in-memory graph still works
    }
  }

  // ── graph helpers ──
  function addNode(node) {
    const id = uid()
    graph.nodes[id] = { ...node, ts: Date.now(), first: Date.now() }
    return id
  }

  function addEdge(from, to, label) {
    const existing = graph.edges.find(e => e.from === from && e.to === to && e.label === label)
    if (existing) {
      existing.weight = (existing.weight || 1) + 1
      existing.last = Date.now()
      return
    }
    graph.edges.push({ from, to, label, weight: 1, first: Date.now(), last: Date.now() })
  }

  function findOrCreateFileNode(path) {
    for (const [id, n] of Object.entries(graph.nodes)) {
      if (n.type === 'file' && n.path === path) return id
    }
    const id = uid()
    graph.nodes[id] = { type: 'file', path, ts: Date.now(), first: Date.now() }
    return id
  }

  function deduplicate(text, type) {
    for (const [id, n] of Object.entries(graph.nodes)) {
      if (n.type === type && n.text === text) return id
    }
    return null
  }

  // ── tokenization ──
  function tokenize(text) {
    return (text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  }

  function semanticSearch(query, limit = 5) {
    const entries = Object.entries(graph.nodes)
    if (!entries.length) return []

    const docs = entries.map(([id, n]) => ({
      id,
      tokens: tokenize(
        (n.text || '') + ' ' + (n.path || '') + ' ' + (n.tool || '') + ' ' + (n.fix || '')
      ),
    }))

    const df = {}
    for (const d of docs) {
      const seen = new Set()
      for (const t of d.tokens) {
        if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t) }
      }
    }
    const N = docs.length
    const idf = t => Math.log((N + 1) / ((df[t] || 0) + 1)) + 1

    const vectors = docs.map(d => {
      const tf = {}
      for (const t of d.tokens) tf[t] = (tf[t] || 0) + 1
      const max = Math.max(1, ...Object.values(tf))
      const vec = {}
      for (const t of Object.keys(tf)) vec[t] = (tf[t] / max) * idf(t)
      return { id: d.id, vec }
    })

    const qt = tokenize(query)
    const qf = {}
    for (const t of qt) qf[t] = (qf[t] || 0) + 1
    const qm = Math.max(1, ...Object.values(qf))
    const qv = {}
    for (const t of Object.keys(qf)) qv[t] = (qf[t] / qm) * idf(t)

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
    const lines = ['## Repo Memory']
    const shown = new Set()
    for (const r of results) {
      const n = r.node
      if (shown.has(r.id)) continue
      shown.add(r.id)
      const prefix = n.type === 'decision' ? '🔄' : n.type === 'error' ? '❌' : n.type === 'file' ? '📁' : '•'
      lines.push(`- ${prefix} [${r.score}%] ${(n.text || n.path || '').slice(0, 80)}`)
      if (n.fix) lines.push(`  ↳ Known fix: ${n.fix}`)
    }
    return lines.join('\n')
  }

  // ── self-evolution: decay ──
  function decay() {
    const now = Date.now()
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

    // Decay unused edges
    for (const e of graph.edges) {
      const age = now - (e.last || e.first || now)
      if (age > THIRTY_DAYS) {
        e.weight = Math.max(1, (e.weight || 1) - 1)
      }
    }

    // Mark stale nodes
    for (const [id, n] of Object.entries(graph.nodes)) {
      const age = now - (n.ts || n.first || now)
      if (age > THIRTY_DAYS) {
        n.stale = true
      }
    }
  }

  // ── live extraction ──
  ctx.on('tools/result', (exec, result) => {
    const name = exec.name
    const args = exec.args || {}

    // ── shell errors ──
    if ((name === 'pwsh' || name === 'bash') && result.error) {
      const text = String(result.error).slice(0, 200)
      let fix = null
      const existing = deduplicate(text, 'error')

      if (existing) {
        const node = graph.nodes[existing]
        node.count = (node.count || 1) + 1
        node.ts = Date.now()
        // Self-evolve: if we have a known fix, link it
        if (node.fix) {
          for (const [id, n] of Object.entries(graph.nodes)) {
            if (n.type === 'decision' && n.text && n.text.includes(node.fix.slice(0, 12))) {
              addEdge(existing, id, 'fixed_by')
            }
          }
        }
      } else {
        if (text.includes('EPERM')) fix = 'Use stdio:inherit'
        else if (text.includes('sandbox')) fix = 'Escalate sandbox permissions'
        else if (text.includes('not found') || text.includes('not recognized')) fix = 'Check installation'
        const nid = addNode({ type: 'error', tool: name, text, fix, count: 1 })
        // Link to any file mentioned in the command
        const cmd = args.command || ''
        const fileMatch = cmd.match(/([A-Z]:[\\/][\w.\\\-]+|~?\/[\w.\/\-]+)/)
        if (fileMatch) addEdge(nid, findOrCreateFileNode(fileMatch[1]), 'errored_in')
      }
      save()
      return
    }

    // ── file edits ──
    if (name === 'edit' || name === 'write') {
      const path = args.file_path || ''
      if (!path) return
      const basename = path.split('/').pop() || path.split('\\').pop()
      const text = `${name === 'write' ? 'Created' : 'Edited'} ${basename}`
      const existing = deduplicate(text, 'decision')
      if (existing) {
        graph.nodes[existing].count = (graph.nodes[existing].count || 1) + 1
        graph.nodes[existing].ts = Date.now()
      } else {
        const nid = addNode({ type: 'decision', text, count: 1 })
        addEdge(nid, findOrCreateFileNode(path), 'affected')
      }
      save()
      return
    }

    // ── successful fixes → close the loop ──
    // If a pwsh command succeeds right after an error, strengthen the fix connection
    if (name === 'pwsh' && !result.error) {
      // Find the most recent error
      let recentError = null
      let recentTs = 0
      for (const [id, n] of Object.entries(graph.nodes)) {
        if (n.type === 'error' && (n.ts || 0) > recentTs) {
          recentError = id
          recentTs = n.ts || 0
        }
      }
      if (recentError && recentTs > Date.now() - 60000) {
        // The command that just succeeded — was it a known fix?
        const cmd = args.command || ''
        const fix = graph.nodes[recentError].fix
        if (fix && cmd.includes(fix.slice(0, 12))) {
          addEdge(recentError, addNode({ type: 'fix_applied', text: `Applied: ${fix.slice(0,40)}`, count: 1 }), 'resolved_by')
          graph.nodes[recentError].resolved = true
          save()
        }
      }
    }
  })

  // ── context injection ──
  ctx.systemPrompt.context({
    name: 'nkg-context',
    order: 450,
    provider() {
      // Snapshot once per session: a system-prompt section that mutates every
      // model step invalidates the request cache from that point onward, which
      // costs far more than the few lines it injects. New events still update
      // the graph on disk for future sessions.
      if (contextSnapshot !== null) return contextSnapshot
      const ids = Object.keys(graph.nodes)
      if (!ids.length) return ''

      // Decay stale edges
      decay()

      // Collect and sort
      const errors = []
      const decisions = []
      for (const id of ids) {
        const n = graph.nodes[id]
        if (n.type === 'error' && !n.resolved && !n.stale) errors.push({ id, ...n })
        if (n.type === 'decision' && !n.stale) decisions.push({ id, ...n })
      }
      errors.sort((a, b) => (b.count || 1) - (a.count || 1))
      decisions.sort((a, b) => (b.count || 1) - (a.count || 1))

      const results = []
      const shown = new Set()

      // Top unresolved errors
      for (const e of errors.slice(0, 2)) {
        results.push({ id: e.id, node: e, score: Math.min(100, (e.count || 1) * 30) })
        shown.add(e.id)
      }

      // Top recent decisions
      for (const d of decisions.slice(0, 2)) {
        if (!shown.has(d.id)) {
          results.push({ id: d.id, node: d, score: Math.min(100, (d.count || 1) * 25) })
          shown.add(d.id)
        }
      }

      // Semantic search for related context
      if (errors.length > 0) {
        const related = semanticSearch(errors[0].text, 2)
        for (const r of related) {
          if (!shown.has(r.id)) { results.push(r); shown.add(r.id) }
        }
      }

      contextSnapshot = formatContext(results.slice(0, 5))
      return contextSnapshot
    },
  })

  // ── bootstrap ──
  load()
}

export { name, inject, apply }