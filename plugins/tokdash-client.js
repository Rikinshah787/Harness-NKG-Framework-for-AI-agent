// tokdash-client.js — Token Dashboard Dynamic Cordis Plugin (Client half)
//
// Polls Host for token stats and renders under the composer dock.

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .tokdash-row {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: var(--dsh-text-secondary);
        padding: 0 2px;
      }
      .tokdash-row span {
        white-space: nowrap;
      }
    `)

    function TokenDash() {
      const [stats, setStats] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        const poll = async () => {
          while (alive) {
            try {
              const data = await host.call('token-stats')
              if (alive) setStats(data)
            } catch (_) {}
            await new Promise(r => { const id = setTimeout(r, 2000); if (!alive) clearTimeout(id) })
          }
        }
        poll()
        return () => { alive = false }
      }, [])

      if (!stats || (stats.input === 0 && stats.output === 0)) {
        return null
      }

      return React.createElement('div', { className: 'tokdash-row' },
        React.createElement('span', null, 'In: ' + stats.input.toLocaleString()),
        React.createElement('span', null, 'Out: ' + stats.output.toLocaleString()),
        React.createElement('span', null, 'Total: ' + (stats.input + stats.output).toLocaleString()),
      )
    }

    slots.inject('conversation.composer.dock', () =>
      slots.register(
        { name: 'conversation.composer.dock', id: 'token-dash', order: 10 },
        () => React.createElement(TokenDash),
      ),
    )
  },
}