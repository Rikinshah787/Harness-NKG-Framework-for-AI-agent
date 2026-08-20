# Harness NKG Framework for AI Agent

A persistent cross-session Neural Knowledge Graph (NKG) that captures decisions, errors, and file relationships from a DeepSeek Harness coding agent session — then injects relevant context into future sessions.

## Architecture

```
┌─ DeepSeek Harness (Cordis Runtime) ──────┐
│                                           │
│  tools/result event ──► Extractors        │
│  systemPrompt.context ◄── Retriever       │
│                           │               │
│                    ┌──────▼──────┐        │
│                    │   NKG.json  │        │
│                    │ (workspace) │        │
│                    └─────────────┘        │
└───────────────────────────────────────────┘
```

## Plugins Included

| Plugin | Type | Purpose |
|--------|------|---------|
| `nkg-4` | Dynamic Cordis Plugin | Core NKG: graph store, extractors (errors from shell, decisions from file edits), retrieval injection |
| `tktrim-1` | Dynamic Cordis Plugin | Suppresses runtime-context snapshot to reduce token cost |
| `tokdsh-2` | Dynamic Cordis Plugin | Live token counter in the composer dock |
| `cordis-lite` | Agent Preset | Lean coding agent preset with compact persona, no runtime context, no ralph |

## NKG v2 Features

- **TF-IDF semantic retrieval** — cosine similarity search across all nodes (zero dependencies, pure JS)
- **Jaccard deduplication** — merges similar errors/decisions (token overlap > 70%), increments `count`
- **Edge weighting** — repeated file-error or file-decision connections strengthen edges
- **Fix hints** — pattern-matches common errors (EPERM, sandbox, not found) and suggests fixes
- **Frequency-weighted injection** — top errors/decisions by recurrence + semantic neighbors of most recent error

## NKG Graph Schema

```json
{
  "nodes": {
    "n1": {
      "type": "error",
      "tool": "pwsh",
      "text": "EPERM on named pipe...",
      "ts": "2025-01-15T10:30:00Z"
    },
    "n2": {
      "type": "decision",
      "text": "Edited auth.ts",
      "ts": "2025-01-15T10:31:00Z"
    },
    "n3": {
      "type": "file",
      "path": "src/auth.ts",
      "ts": "2025-01-15T10:31:00Z"
    }
  },
  "edges": [
    { "from": "n1", "to": "n3", "label": "errored_in" },
    { "from": "n2", "to": "n3", "label": "affected" }
  ]
}
```

## Directory Structure

```
├── plugins/                    # Dynamic Cordis Plugin source code
│   ├── nkg.js                 # Neural Knowledge Graph plugin
│   ├── tktrim.js              # Token trimmer (runtime-context suppressor)
│   └── tokdash.js             # Token dashboard
├── presets/                    # Agent presets
│   └── cordis-lite/           # Lean coding agent preset
│       ├── agent.cordis.yml
│       └── preset.yml
├── nkg.json                    # Live graph (generated at runtime)
└── README.md
```

## Getting Started

1. Install [DeepSeek Harness](https://github.com/deepseek-ai/dsh)
2. Copy the presets to `~/.dsh/.agent-presets/cordis-lite/`
3. Start a session on the `cordis-lite` preset
4. Define and run the plugins via `cordis_define` + `cordis_run`

## NKG Plugin Code

See [`plugins/nkg.js`](plugins/nkg.js) for the full implementation.

### What it captures

| Trigger | Node type | Description |
|---------|-----------|-------------|
| `pwsh`/`bash` errors | `error` | Shell command failures, linked to files |
| `edit`/`write` calls | `decision` | File modifications |
| File paths in context | `file` | Referenced files |

### What it injects

Before each model step, the 5 most recent decisions and errors are injected as:

```
## Knowledge Graph Context
- ⚠️ Error: EPERM on named pipe...
  File: src/some-test.ts
- 📋 Decision: Edited auth.ts
  File: src/auth.ts
```

## Roadmap

- [ ] User-message extraction (parse directives for explicit decisions)
- [ ] Semantic retrieval (embedding-based similarity search)
- [ ] Edge weighting and learning feedback loop
- [ ] Client UI for graph visualization
- [ ] RPC API for external graph queries
- [ ] Entity extraction from file contents (functions, classes, imports)

## License

MIT