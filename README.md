# Harness NKG Framework

A Neural Knowledge Graph that runs inside the DeepSeek Harness — capturing decisions, errors, file relationships, and skills into a self-optimizing graph. Compresses context to 3 lines instead of verbose prompts.

## What It Does

| Feature | How |
|---------|-----|
| **Skill Compiler** | Pre-processes SKILL.md files into graph nodes — no more loading full markdown into prompts |
| **Live Extraction** | Captures every error (shell) and decision (file edit) as graph nodes with weighted edges |
| **Compressed Context** | Injects at most 3 lines before each model step instead of verbose markdown blocks |
| **Deduplication** | Same error happening again increments count instead of creating duplicate nodes |
| **Edge Weighting** | Repeated file-error or file-decision connections strengthen edges |
| **Client Visualization** | Live stats dock under the composer: errors, decisions, files, skills, edges |

## Plugins

```
plugins/
├── nkg.js              # Host: graph engine, skill compiler, extractors, compressed context
├── nkg-client.js        # Client: dock visualization in conversation.composer.dock
├── tktrim.js            # Token optimization: suppresses runtime-context snapshot
├── tokdash.js           # Token dashboard Host: intercepts llm/stream, counts tokens
└── tokdash-client.js    # Token dashboard Client: live counter under composer
```

## Presets

```
presets/cordis-lite/
├── agent.cordis.yml     # Lean agent composition (no ralph, compact persona, no runtime context)
└── preset.yml           # Display metadata
```

## Getting Started

1. Install DeepSeek Harness
2. Copy `presets/cordis-lite/` to `~/.dsh/.agent-presets/cordis-lite/`
3. Start a session on the `cordis-lite` preset
4. Define plugins via `cordis_define` + `cordis_run`

## Graph Schema

```json
{
  "nodes": {
    "n1": { "type": "error", "tool": "pwsh", "text": "EPERM on named pipe", "count": 3 },
    "n2": { "type": "decision", "text": "Created cordis-lite preset", "count": 1 },
    "n3": { "type": "file", "path": "presets/cordis-lite/agent.cordis.yml" },
    "n4": { "type": "skill", "skill": "ponytail", "text": "Lazy coding: YAGNI..." },
    "n5": { "type": "skill_rule", "text": "Does this need to exist?", "skill": "ponytail" }
  },
  "edges": [
    { "from": "n1", "to": "n3", "label": "errored_in", "weight": 3 },
    { "from": "n4", "to": "n5", "label": "has_rule", "weight": 1 }
  ]
}
```

## Context Output Example

Before each model step, the NKG injects at most 3 compressed lines:

```
⚠️ EPERM on named pipe
📋 Created cordis-lite preset
💡 Does this need to exist? Skip speculative features
```

## Roadmap

- [ ] Persistent graph storage (.nkg.json per workspace)
- [ ] Semantic retrieval (TF-IDF cosine similarity across all nodes)
- [ ] Skill auto-ingestion from any SKILL.md in user skill dirs
- [ ] Graph export/import for sharing between machines
- [ ] Learning feedback loop (usage frequency → edge weight adjustment)

## License

MIT