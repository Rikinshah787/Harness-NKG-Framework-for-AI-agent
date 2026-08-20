// nkg.js — NKG v7 Host: Neural Knowledge Graph with Skills Compiler
//
// Core engine for the Harness NKG Framework.
// - Pre-processes skills into graph nodes (no more full SKILL.md loading)
// - Captures errors and decisions from tool events in real-time
// - Outputs compressed 3-line context instead of verbose markdown
// - Exposes graph-data RPC for the Client visualization
//
// Deploy: cordis_define → cordis_run

return {
  apply(ctx) {
    var sp = ctx.get('systemPrompt')
    if (sp === undefined) return

    var graph = { nodes: {}, edges: [] }
    var nextId = 0
    function uid() { nextId++; return 'n' + nextId }

    function addNode(node) { var id = uid(); graph.nodes[id] = node; node.ts = new Date().toISOString(); return id }
    function addEdge(from, to, label) {
      for (var i = 0; i < graph.edges.length; i++) {
        var e = graph.edges[i]
        if (e.from === from && e.to === to && e.label === label) { e.weight = (e.weight||1)+1; return }
      }
      graph.edges.push({ from: from, to: to, label: label, weight: 1 })
    }
    function findOrCreateFileNode(path) {
      var ids = Object.keys(graph.nodes)
      for (var i = 0; i < ids.length; i++) { var n = graph.nodes[ids[i]]; if (n.type === 'file' && n.path === path) return ids[i] }
      var id = uid(); graph.nodes[id] = { type: 'file', path: path, ts: new Date().toISOString() }; return id
    }
    function deduplicate(txt, tp) {
      var ids = Object.keys(graph.nodes)
      for (var i = 0; i < ids.length; i++) { var n = graph.nodes[ids[i]]; if (n.type === tp && n.text === txt) return ids[i] }
      return null
    }

    // ── RPC ──
    harness.handle('graph-data', function() {
      var nodes = []
      var ids = Object.keys(graph.nodes)
      for (var i = 0; i < ids.length; i++) {
        var n = graph.nodes[ids[i]]
        var label = ''
        if (n.type === 'file') label = (n.path||'').split(/[/\\]/).pop()
        else if (n.type === 'skill') label = n.skill || ''
        else label = (n.text||'').slice(0, 40)
        nodes.push({ id: ids[i], type: n.type, label: label, count: n.count||1, ts: n.ts })
      }
      return { nodes: nodes, edges: graph.edges }
    })

    // ── Skill ingestion ──
    function ingestSkills() {
      var ids = Object.keys(graph.nodes)
      for (var i = 0; i < ids.length; i++) { if (graph.nodes[ids[i]].type === 'skill') return }

      // ponytail
      var pt = addNode({ type: 'skill', skill: 'ponytail', text: 'Lazy coding: YAGNI, stdlib first, native over deps, one-liners', intensity: 'full' })
      addEdge(pt, addNode({ type: 'skill_rule', text: 'Does this need to exist? Skip speculative features', skill: 'ponytail' }), 'has_rule')
      addEdge(pt, addNode({ type: 'skill_rule', text: 'Stdlib over custom code. Already-installed dep over new dep', skill: 'ponytail' }), 'has_rule')
      addEdge(pt, addNode({ type: 'skill_rule', text: 'Shortest diff wins. No unrequested abstractions', skill: 'ponytail' }), 'has_rule')

      // karpathy-guidelines
      var kg = addNode({ type: 'skill', skill: 'karpathy-guidelines', text: 'Think before coding: surface assumptions, surgical changes, verify' })
      addEdge(kg, addNode({ type: 'skill_rule', text: 'State assumptions explicitly. Present multiple interpretations', skill: 'karpathy-guidelines' }), 'has_rule')
      addEdge(kg, addNode({ type: 'skill_rule', text: 'Make surgical changes. Dont refactor unrelated code', skill: 'karpathy-guidelines' }), 'has_rule')
      addEdge(kg, addNode({ type: 'skill_rule', text: 'Define verifiable success criteria before writing code', skill: 'karpathy-guidelines' }), 'has_rule')

      // find-skills
      var fs = addNode({ type: 'skill', skill: 'find-skills', text: 'Discover and install agent skills from ecosystem' })
      addEdge(fs, addNode({ type: 'skill_rule', text: 'Use when user asks how to do X or wants to extend capabilities', skill: 'find-skills' }), 'has_rule')
    }
    ingestSkills()

    // ── Seeds ──
    if (Object.keys(graph.nodes).filter(function(k) { return graph.nodes[k].type === 'error' }).length === 0) {
      var e1 = addNode({ type: 'error', tool: 'pwsh', text: 'EPERM on named pipe', fix: 'Use stdio:inherit', count: 3 })
      var d1 = addNode({ type: 'decision', text: 'Built NKG with TF-IDF retrieval', count: 1 })
      var d2 = addNode({ type: 'decision', text: 'Created cordis-lite preset', count: 1 })
      var f1 = findOrCreateFileNode('plugins/nkg.js')
      var f2 = findOrCreateFileNode('presets/cordis-lite/agent.cordis.yml')
      addEdge(e1, f1, 'errored_in')
      addEdge(d1, f1, 'affected')
      addEdge(d2, f2, 'affected')
    }

    // ── Live extraction ──
    ctx.on('tools/result', function(exec, result) {
      var n = exec.name; var a = exec.args || {}
      if ((n === 'pwsh' || n === 'bash') && result.error) {
        var t = String(result.error).slice(0, 200)
        var d = deduplicate(t, 'error')
        if (d) { graph.nodes[d].count = (graph.nodes[d].count||1)+1; graph.nodes[d].ts = new Date().toISOString() }
        else {
          var c = a.command || ''
          var m = c.match(/([\\/][\w.\-\/]+\\.[a-z]{1,6})/i)
          var id = addNode({ type: 'error', tool: n, text: t, fix: null, count: 1 })
          if (m) addEdge(id, findOrCreateFileNode(m[1]), 'errored_in')
        }
      }
      if (n === 'edit' || n === 'write') {
        var p = a.file_path || ''
        if (!p) return
        var b = p.split('/').pop() || p.split('\\').pop()
        var txt = (n === 'write' ? 'Created ' : 'Edited ') + b
        var d = deduplicate(txt, 'decision')
        if (d) { graph.nodes[d].count = (graph.nodes[d].count||1)+1; graph.nodes[d].ts = new Date().toISOString() }
        else { var id = addNode({ type: 'decision', text: txt, count: 1 }); addEdge(id, findOrCreateFileNode(p), 'affected') }
      }
    })

    // ── Compressed context (max 3 lines) ──
    sp.context({ name: 'nkg-context', order: 450, provider: function() {
      var ids = Object.keys(graph.nodes)
      if (ids.length === 0) return ''

      var errors = []; var decisions = []; var rules = []
      for (var i = 0; i < ids.length; i++) {
        var n = graph.nodes[ids[i]]
        if (n.type === 'error') errors.push([ids[i], n])
        if (n.type === 'decision') decisions.push([ids[i], n])
        if (n.type === 'skill_rule') rules.push([ids[i], n])
      }
      errors.sort(function(a,b){ return (b[1].count||1)-(a[1].count||1) })
      decisions.sort(function(a,b){ return (b[1].count||1)-(a[1].count||1) })

      var lines = []
      if (errors.length > 0) lines.push('⚠️ ' + errors[0][1].text)
      if (decisions.length > 0) lines.push('📋 ' + decisions[0][1].text)
      if (rules.length > 0) lines.push('💡 ' + rules[0][1].text)

      return lines.length > 0 ? lines.join('\n') : ''
    }})
  },
}