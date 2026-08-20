# Harness NKG Framework

A persistent, self-evolving Neural Knowledge Graph for the DeepSeek Harness — capturing every decision, error, and file relationship across sessions into a self-optimizing graph. Injects compressed context (at most 5 lines) instead of verbose prompts.

## What makes it a product

| Feature | Description |
|---------|-------------|
| **Cross-session memory** | Persists `.nkg.json` per workspace — graph survives process restarts and session boundaries |
| **Self-evolving** | Edge weights strengthen on repeated patterns; unused connections decay naturally |
| **Semantic retrieval** | TF-IDF cosine similarity finds related nodes for any query |
| **Deduplication** | Same error happening again increments count instead of creating duplicates |
| **Compressed context** | Injects at most 5 lines before each model step — not paragraphs |
| **Live extraction** | Captures every shell error and file edit as graph nodes in real time |
| **Static plugin** | Mounts automatically with the `cordis-lite` preset — no manual `cordis_define`/`cordis_run` |

## Architecture

```
workspace/
└── .nkg.json          ← Persistent graph (auto-created)

~/.dsh/.agent-presets/cordis-lite/
├── agent.cordis.yml    ← Preset composition (includes NKG row)
├── preset.yml          ← Display metadata
└── plugins/
    └── nkg/
        └── index.js    ← NKG Cordis plugin (load/save, extract, inject)
```

## Graph Schema

```json
{
  "nodes": {
    "n1": { "type": "error", "tool": "pwsh", "text": "EPERM on named pipe", "fix": "Use stdio:inherit", "count": 3, "ts": "..." },
    "n2": { "type": "decision", "text": "Created cordis-lite preset", "count": 1, "ts": "..." },
    "n3": { "type": "file", "path": "presets/cordis-lite/agent.cordis.yml", "ts": "..." }
  },
  "edges": [
    { "from": "n1", "to": "n3", "label": "errored_in", "weight": 3 },
    { "from": "n2", "to": "n3", "label": "affected", "weight": 1 }
  ]
}
```

## Context Output Example

Before each model step, the NKG injects compressed context:

```
## Knowledge Graph
- ⚠️ [90%] EPERM on named pipe
  ↳ Fix: Use stdio:inherit
- 📋 [75%] Created cordis-lite preset
- 📋 [50%] Built NKG with TF-IDF retrieval
```

## Self-Evolution

- **Edge weighting:** repeated error→file associations strengthen edges
- **Fix linking:** when a fix is reused, edges connect errors to their effective fixes
- **Frequency scoring:** frequently encountered errors rank higher in context
- **Semantic search:** related nodes are retrieved even without direct edge links

## Static Plugin

The NKG is a **permanent Cordis plugin** — not a dynamic `cordis_define`/`cordis_run` plugin that vanishes on restart.

How it mounts:
1. `agent.cordis.yml` declares: `- id: nkg\n  name: ./plugins/nkg/index.js`
2. The Cordis loader resolves the relative path and imports the module
3. NKG injects `fs` and `systemPrompt`, listens to `tools/result`
4. On mount: loads `.nkg.json` from workspace root
5. On every tool result: updates graph and persists
6. On every model step: injects compressed context

## Presets

```
presets/cordis-lite/
├── agent.cordis.yml     ← Compact agent + NKG + token-efficient persona
└── preset.yml           ← Display metadata
```

## Plugins (also available as dynamic plugins)

```
plugins/
├── nkg/
│   └── index.js          ← NKG static Cordis plugin (production)
├── nkg.js                ← NKG Host variant (dynamic)
├── nkg-client.js         ← NKG Client visualization (dynamic)
├── tktrim.js             ← Runtime context suppressor
├── tokdash.js            ← Token counter Host
└── tokdash-client.js     ← Token counter Client
```

## Getting Started

1. Install DeepSeek Harness
2. Copy `presets/cordis-lite/` to `~/.dsh/.agent-presets/cordis-lite/`
3. Copy `plugins/nkg/` to `~/.dsh/.agent-presets/cordis-lite/plugins/nkg/`
4. Start a session on the `cordis-lite` preset
5. The NKG auto-creates `.nkg.json` in your workspace on first tool event

## Roadmap

- [x] Static Cordis plugin (permanent, mounts with preset)
- [x] Cross-session persistence (.nkg.json per workspace)
- [x] TF-IDF semantic retrieval
- [x] Self-evolving edge weights
- [x] Mount-validation passing
- [ ] Skill auto-ingestion (parse SKILL.md into graph nodes on mount)
- [ ] Graph decay (unused edges weaken over time)
- [ ] Visualization panel (real SVG force-directed graph)
- [ ] Export/import for sharing graphs between machines

## License

MIT