# 🧠 NKG — Neural Knowledge Graph for AI Agents

**Give your AI agent a memory that survives restarts, learns from mistakes, and costs almost nothing in tokens.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: DeepSeek Harness](https://img.shields.io/badge/Platform-DeepSeek%20Harness-blue.svg)](#requirements)
[![Dependencies: 0](https://img.shields.io/badge/Dependencies-0-brightgreen.svg)](#how-it-works)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](#contributing)

---

## The problem

Every AI coding agent has amnesia. It hits the same sandbox error it hit yesterday, rediscovers the same fix, re-reads the same files — and you pay for that rediscovery in tokens, latency, and wrong turns. Session ends, everything learned is gone.

## The solution

NKG is a **single-file, zero-dependency Cordis plugin** for the [DeepSeek Harness](https://github.com/deepseek-ai) that builds a persistent knowledge graph from what your agent actually does:

- ❌ **Errors** it hits (with known fixes, linked when a fix works)
- 🔄 **Decisions** it makes (file edits, creations)
- 📁 **Files** those events touch

…then injects a **compressed snapshot (≤5 lines)** into the system prompt of future sessions. Not paragraphs of "memory" — a ranked, deduplicated digest of what actually matters in *this* repo.

```
## Repo Memory
- ❌ [90%] EPERM spawning child process with stdio 'pipe' under sandbox
  ↳ Known fix: Use stdio:inherit
- 🔄 [75%] Edited agent.cordis.yml
- 📁 [23%] plugins/nkg/index.js
```

That's the entire overhead. Five lines.

## Why it's different

| | Typical "agent memory" | NKG |
|---|---|---|
| **Storage** | Vector DB, embeddings service | One JSON file in `.git/` — follows the repo |
| **Dependencies** | SDK + API keys + infra | Zero. ~350 lines of plain JS |
| **Token cost** | Paragraphs of retrieved chunks | ≤5 ranked lines |
| **Prompt caching** | Usually breaks it | **Cache-stable by design** — snapshot computed once per session so your prompt prefix never changes mid-conversation |
| **Learning** | Static retrieval | Self-evolving: repeat errors rank higher, reused fixes strengthen edges, stale nodes decay after 30 days |
| **Setup** | Config + accounts | Copy one folder, start a session |

### Git-aware storage

The graph lives in `.git/nkg.json` — inside your repo but invisible to git. Clone the repo to a new machine? Same graph location convention. Work from a subdirectory? Same graph. No git repo? Falls back to `.nkg.json` in the workspace root.

### Prompt-cache-friendly (v9.1)

Most context-injection plugins silently destroy request caching: content that changes every model step invalidates the cached prompt prefix, forcing full re-processing *every turn*. NKG computes its snapshot **once per session** — the prefix stays byte-stable, the cache keeps hitting, and new learnings surface in the next session. This is the difference between a memory plugin that pays for itself and one that costs more than it saves.

## Quick start

**Requirements:** [DeepSeek Harness](https://github.com/deepseek-ai) (`dsh`) installed.

```powershell
# Windows
git clone https://github.com/Rikinshah787/Harness-NKG-Framework-for-AI-agent.git
cd Harness-NKG-Framework-for-AI-agent
./install.ps1
```

```bash
# macOS / Linux
git clone https://github.com/Rikinshah787/Harness-NKG-Framework-for-AI-agent.git
cd Harness-NKG-Framework-for-AI-agent
./install.sh
```

Then start a session on the **`cordis-lite`** preset (session picker, or set it as default in `~/.dsh/settings.yaml`):

```yaml
agent-presets:
  default: cordis-lite
```

That's it. The graph auto-creates on the first tool event and grows as the agent works.

<details>
<summary>Manual install</summary>

1. Copy `presets/cordis-lite/` → `~/.dsh/.agent-presets/cordis-lite/`
2. Copy `plugins/nkg/` → `~/.dsh/.agent-presets/cordis-lite/plugins/nkg/`
3. Start a session on the `cordis-lite` preset

</details>

## How it works

```
                        ┌─────────────────────────────┐
  tool events           │   Knowledge Graph            │        next session
──────────────────►     │                              │   ─────────────────►
  shell errors          │  nodes: error / decision /   │    ≤5-line snapshot
  file edits            │         file / fix           │    injected once,
  successful fixes      │  edges: errored_in /         │    prompt-cache safe
                        │         affected / fixed_by  │
                        └──────────────┬───────────────┘
                                       │ persists to
                                       ▼
                              .git/nkg.json
```

1. **Capture** — listens to `tools/result` events; shell errors, file edits, and fix confirmations become nodes and edges in real time
2. **Evolve** — duplicate events increment counts instead of duplicating nodes; a command that succeeds right after a known error strengthens the error→fix edge; edges unused for 30 days decay and stale nodes drop out of retrieval
3. **Retrieve** — top unresolved errors and recent decisions, plus TF-IDF cosine-similarity search for related context (no embeddings API — pure JS)
4. **Inject** — one compressed snapshot per session via the harness `systemPrompt` service

### Graph schema

```json
{
  "nodes": {
    "n1": { "type": "error", "tool": "pwsh", "text": "EPERM on named pipe", "fix": "Use stdio:inherit", "count": 3 },
    "n2": { "type": "decision", "text": "Edited agent.cordis.yml", "count": 2 },
    "n3": { "type": "file", "path": "presets/cordis-lite/agent.cordis.yml" }
  },
  "edges": [
    { "from": "n1", "to": "n3", "label": "errored_in", "weight": 3 },
    { "from": "n2", "to": "n3", "label": "affected", "weight": 1 }
  ]
}
```

## What's in the box

```
presets/cordis-lite/        Lean coding preset (standard tools, compact persona, NKG mounted)
presets/sec-agent/          Defensive security-auditor preset: severity-rated findings with
                            file:line evidence, CVE verification via web search, read-only
                            bias, secret-safe reporting - same lean toolchain + NKG memory
plugins/nkg/index.js        ⭐ The NKG plugin (static — mounts with the preset, survives restarts)
plugins/nkg.js              NKG dynamic-plugin variant (try it via cordis_define without installing)
plugins/nkg-client.js       Live graph-stats dock for the DSH web UI (dynamic)
plugins/tokdash.js + tokdash-client.js   Bonus: live token counter under the composer
plugins/tktrim.js           Bonus: one-liner runtime-context suppressor (~200–400 tokens/turn)
```

The `cordis-lite` preset is itself a token optimization: it mounts only the tools a coding agent actually uses — no dynamic-plugin toolchain, no workflow/ralph machinery — cutting thousands of system-prompt tokens per request versus a full preset.

## Roadmap

- [x] Static Cordis plugin — mounts with the preset, survives restarts
- [x] Git-aware cross-session persistence (`.git/nkg.json`)
- [x] TF-IDF semantic retrieval (zero dependencies)
- [x] Self-evolution: dedup counts, fix-reuse edge boosting, resolved tracking
- [x] 30-day decay with stale-node filtering *(v9.1)*
- [x] Prompt-cache-stable session snapshots *(v9.1)*
- [ ] Skill auto-ingestion (parse `SKILL.md` files into graph nodes on mount)
- [ ] Force-directed SVG graph visualization panel
- [ ] Graph export/import for sharing between machines and teammates
- [ ] Configurable capture rules (custom node types per project)

## Contributing

Issues and PRs welcome. The whole plugin is one file — [`plugins/nkg/index.js`](plugins/nkg/index.js) — so it's an easy codebase to jump into. Good first contributions: items on the roadmap, capture rules for more tool types, or graph pruning strategies.

## License

[MIT](LICENSE) © Rikin Shah
