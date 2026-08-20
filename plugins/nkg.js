// nkg.js — Neural Knowledge Graph Dynamic Cordis Plugin
//
// Deploy: cordis_define with plugin.kind "new", idPrefix "nkg"
//         cordis_run after define
//
// Stores graph as nkg.json in the session workspace.
// Captures errors from shell tools and decisions from file edits.
// Injects recent context via systemPrompt.context() before each model step.

return {
  apply(ctx) {
    // ── dependencies ──
    const sp = ctx.get('systemPrompt')
    const fs = ctx.get('fs')
    if (sp === undefined || fs === undefined) return

    // ── graph state ──
    const GRAPH_PATH = 'nkg.json'
    let graph = { nodes: {}, edges: [] }
    let nextId = 0
    const uid = () => 'n' + String(++nextId)

    // ── persistence ──
    async function load() {
      try {
        const target = await fs.resolve(GRAPH_PATH)
        const text = await fs.readText(target)
        const parsed = JSON.parse(text)
        graph = parsed
        nextId = Math.max(0, ...Object.keys(graph.nodes).map(k => parseInt(k.slice(1), 10) || 0))
        console.log('NKG loaded:', Object.keys(graph.nodes).length, 'nodes,', graph.edges.length, 'edges')
      } catch (_) {
        console.log('NKG: no existing graph, starting fresh')
      }
    }

    async function save() {
      try {
        const target = await fs.resolve(GRAPH_PATH)
        await fs.writeText(target, JSON.stringify(graph, null, 2))
      } catch (_) {
        console.error('NKG: failed to save')
      }
    }

    function addNode(node) {
      const id = uid()
      graph.nodes[id] = { ...node, ts: new Date().toISOString() }
      return id
    }

    function addEdge(from, to, label) {
      graph.edges.push({ from, to, label })
    }

    function findOrCreateFileNode(path) {
      for (const [id, node] of Object.entries(graph.nodes)) {
        if (node.type === 'file' && node.path === path) return id
      }
      const id = uid()
      graph.nodes[id] = { type: 'file', path: path, ts: new Date().toISOString() }
      return id
    }

    // ── retrieval ──
    function getRecentContext(limit) {
      limit = limit || 5
      const sorted = Object.entries(graph.nodes)
        .filter(([_, n]) => n.type === 'decision' || n.type === 'error')
        .sort((a, b) => (b[1].ts || '').localeCompare(a[1].ts || ''))
        .slice(0, limit)
      if (sorted.length === 0) return ''
      const lines = ['## Knowledge Graph Context']
      for (const [id, node] of sorted) {
        const prefix = node.type === 'decision' ? '📋 Decision' : '⚠️ Error'
        lines.push(`- ${prefix}: ${node.text}`)
        if (node.fix) lines.push(`  Fix: ${node.fix}`)
        for (const e of graph.edges) {
          if (e.from === id && graph.nodes[e.to]?.type === 'file') {
            lines.push(`  File: ${graph.nodes[e.to].path}`)
          }
        }
      }
      return lines.join('\n')
    }

    // ── extractors ──
    ctx.on('tools/result', (exec, result) => {
      const name = exec.name
      const args = exec.args || {}

      // ── error extraction: shell failures ──
      if ((name === 'pwsh' || name === 'bash') && result.error) {
        const errText = String(result.error).slice(0, 200)
        const id = addNode({
          type: 'error',
          tool: name,
          text: errText,
        })
        const cmd = args.command || ''
        const fileMatch = cmd.match(/([\\/][\w.\-\/]+\\.[a-z]{1,6})/i)
        if (fileMatch) {
          const fileId = findOrCreateFileNode(fileMatch[1])
          addEdge(id, fileId, 'errored_in')
        }
        save()
        return
      }

      // ── decision extraction: file edits ──
      if (name === 'edit' || name === 'write') {
        const filePath = args.file_path || ''
        if (!filePath) return
        const fileId = findOrCreateFileNode(filePath)
        const id = addNode({
          type: 'decision',
          text: `${name === 'write' ? 'Created/wrote' : 'Edited'} ${filePath.split('/').pop() || filePath.split('\\').pop()}`,
        })
        addEdge(id, fileId, 'affected')
        save()
      }
    })

    // ── context injection ──
    sp.context({
      name: 'nkg-context',
      order: 500,
      provider: () => getRecentContext(5),
    })

    // ── bootstrap ──
    load()
  },
}