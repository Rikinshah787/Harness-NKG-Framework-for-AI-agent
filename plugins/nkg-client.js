// nkg-client.js — NKG v7 Client: compact dock visualization
//
// Registers in conversation.composer.dock showing live graph stats:
// errors, decisions, files, skills, edges.
// Polls host.call('graph-data') every 3 seconds.

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    function NkgDock() {
      const [stats, setStats] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        const poll = async () => {
          while (alive) {
            try {
              const data = await host.call('graph-data')
              if (alive) setStats(data)
            } catch (_) {}
            await new Promise(r => { const id = setTimeout(r, 3000); if (!alive) clearTimeout(id) })
          }
        }
        poll()
        return () => { alive = false }
      }, [])

      if (!stats || !stats.nodes || stats.nodes.length === 0) {
        return React.createElement('div', { style: { fontSize:'11px', color:'#666', padding:'2px 8px' } }, '🧠 NKG empty')
      }

      var errors = 0, decisions = 0, files = 0, skills = 0
      for (var i = 0; i < stats.nodes.length; i++) {
        var t = stats.nodes[i].type
        if (t === 'error') errors++
        else if (t === 'decision') decisions++
        else if (t === 'file') files++
        else if (t === 'skill') skills++
      }

      var parts = ['🧠']
      if (errors) parts.push(errors + ' err')
      if (decisions) parts.push(decisions + ' dec')
      if (files) parts.push(files + ' file')
      if (skills) parts.push(skills + ' skill')
      parts.push(stats.edges.length + ' edges')

      return React.createElement('div', { style: { fontSize:'11px', color:'#888', padding:'2px 8px', display:'flex', gap:'10px' } },
        ...parts.map(function(p) { return React.createElement('span', null, p) })
      )
    }

    slots.inject('conversation.composer.dock', () =>
      slots.register(
        { name: 'conversation.composer.dock', id: 'nkg-dock', order: 20 },
        () => React.createElement(NkgDock),
      ),
    )
  },
}