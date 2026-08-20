// nkg-client.js — Neural Knowledge Graph v3 Client visualization
//
// Registers a floating panel in shell.overlay showing the NKG graph
// with expandable nodes, edge display, color coding, and live polling.

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .nkg-panel {
        position: fixed;
        top: 60px;
        right: 16px;
        width: 420px;
        max-height: 500px;
        background: var(--dsh-bg-elevated, #1e1e2e);
        border: 1px solid var(--dsh-border, #333);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 1000;
        overflow: hidden;
        pointer-events: auto;
        font-size: 11px;
        color: var(--dsh-text-primary, #eee);
      }
      .nkg-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--dsh-bg-surface, #181825);
        border-bottom: 1px solid var(--dsh-border, #333);
        cursor: move;
        user-select: none;
      }
      .nkg-header h3 { margin: 0; font-size: 13px; font-weight: 600; }
      .nkg-close {
        background: none; border: none;
        color: var(--dsh-text-secondary, #888);
        cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1;
      }
      .nkg-close:hover { color: var(--dsh-text-primary, #eee); }
      .nkg-body { padding: 8px; max-height: 440px; overflow-y: auto; }
      .nkg-legend { display: flex; gap: 12px; padding: 4px 8px; font-size: 10px; }
      .nkg-legend span { display: flex; align-items: center; gap: 4px; }
      .nkg-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .nkg-node-row {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 6px; border-radius: 4px; cursor: pointer;
      }
      .nkg-node-row:hover { background: var(--dsh-bg-hover, #2a2a3a); }
      .nkg-node-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .nkg-node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nkg-node-count { color: var(--dsh-text-secondary, #888); font-size: 10px; min-width: 24px; text-align: right; }
      .nkg-edges-title { font-size: 10px; color: var(--dsh-text-secondary, #888); padding: 4px 6px; margin-top: 4px; }
      .nkg-edge-row { font-size: 10px; padding: 1px 12px; color: var(--dsh-text-secondary, #888); }
      .nkg-empty { text-align: center; color: var(--dsh-text-secondary, #888); padding: 24px; font-size: 12px; }
    `)

    const COLORS = { error: '#ef4444', decision: '#3b82f6', file: '#22c55e' }

    function GraphPanel() {
      const [data, setData] = React.useState(null)
      const [expanded, setExpanded] = React.useState(null)
      const [visible, setVisible] = React.useState(true)

      React.useEffect(() => {
        let alive = true
        const poll = async () => {
          while (alive) {
            try {
              const d = await host.call('graph-data')
              if (alive) setData(d)
            } catch (_) {}
            await new Promise(r => { const id = setTimeout(r, 3000); if (!alive) clearTimeout(id) })
          }
        }
        poll()
        return () => { alive = false }
      }, [])

      if (!visible) return null

      if (!data || data.nodes.length === 0) {
        return React.createElement('div', { className: 'nkg-panel' },
          React.createElement('div', { className: 'nkg-header' },
            React.createElement('h3', null, '🧠 Knowledge Graph'),
            React.createElement('button', { className: 'nkg-close', onClick: () => setVisible(false) }, '×'),
          ),
          React.createElement('div', { className: 'nkg-body' },
            React.createElement('div', { className: 'nkg-empty' }, 'No graph data yet. Run some commands and file edits to populate it.'),
          ),
        )
      }

      const nodeMap = {}
      for (const n of data.nodes) nodeMap[n.id] = n

      const fileNodes = data.nodes.filter(n => n.type === 'file')
      const otherNodes = data.nodes.filter(n => n.type !== 'file').sort((a, b) => (b.count || 1) - (a.count || 1))

      return React.createElement('div', { className: 'nkg-panel' },
        React.createElement('div', { className: 'nkg-header' },
          React.createElement('h3', null, '🧠 NKG — ' + data.nodes.length + ' nodes, ' + data.edges.length + ' edges'),
          React.createElement('button', { className: 'nkg-close', onClick: () => setVisible(false) }, '×'),
        ),
        React.createElement('div', { className: 'nkg-legend' },
          React.createElement('span', null, React.createElement('span', { className: 'nkg-legend-dot', style: { background: COLORS.error } }), 'Error'),
          React.createElement('span', null, React.createElement('span', { className: 'nkg-legend-dot', style: { background: COLORS.decision } }), 'Decision'),
          React.createElement('span', null, React.createElement('span', { className: 'nkg-legend-dot', style: { background: COLORS.file } }), 'File'),
        ),
        React.createElement('div', { className: 'nkg-body' },
          ...otherNodes.map(n => {
            const edges = data.edges.filter(e => e.from === n.id || e.to === n.id)
            const isExpanded = expanded === n.id
            return React.createElement('div', { key: n.id },
              React.createElement('div', { className: 'nkg-node-row', onClick: () => setExpanded(isExpanded ? null : n.id) },
                React.createElement('span', { className: 'nkg-node-dot', style: { background: COLORS[n.type] || '#888' } }),
                React.createElement('span', { className: 'nkg-node-label' }, n.label),
                React.createElement('span', { className: 'nkg-node-count' }, n.count > 1 ? '×' + n.count : ''),
              ),
              isExpanded && edges.length > 0 && React.createElement('div', null,
                React.createElement('div', { className: 'nkg-edges-title' }, 'Connected files:'),
                ...edges.map((e, i) => {
                  const otherId = e.from === n.id ? e.to : e.from
                  const other = nodeMap[otherId]
                  if (!other) return null
                  return React.createElement('div', { key: i, className: 'nkg-edge-row' },
                    (e.label || 'linked') + ': ' + (other.label || other.id),
                    e.weight > 1 ? ' (×' + e.weight + ')' : '',
                  )
                }),
              ),
            )
          }),
          fileNodes.length > 0 && React.createElement('div', { style: { marginTop: '8px' } },
            React.createElement('div', { className: 'nkg-edges-title' }, 'Files (' + fileNodes.length + '):'),
            ...fileNodes.map(n =>
              React.createElement('div', { key: n.id, className: 'nkg-edge-row' }, '📁 ' + n.label),
            ),
          ),
        ),
      )
    }

    slots.inject('shell.overlay', () =>
      slots.register(
        { name: 'shell.overlay', id: 'nkg-graph', order: 50 },
        () => React.createElement(GraphPanel),
      ),
    )
  },
}