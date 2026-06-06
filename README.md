# pi-model-discovery

A [Pi](https://pi.dev) extension that auto-discovers local model providers (Ollama first) and registers their models with Pi on startup — no `/reload` required.

## What it does

On every Pi session start, this extension:

1. Queries your configured local provider(s) for installed models
2. Pulls per-model metadata (context window, vision/reasoning/tools capabilities) from Ollama's `/api/show` endpoint
3. Registers all discovered models via Pi's `registerProvider()` so they're immediately available
4. Optionally adds them to `enabledModels` in `settings.json` so they appear in the model picker
5. Caches capability data to avoid hammering `/api/show` on every startup

## Install

```bash
pi install npm:@kylebrodeur/pi-model-discovery
```

Update an existing install:

```bash
pi update npm:@kylebrodeur/pi-model-discovery
```

## Commands

| Command | Description |
|---------|-------------|
| `/providers status` | Show current config, registered models, and capability counts |
| `/providers sync` | Re-run the discovery sync (uses cache) |
| `/providers sync --force` | Bypass the capability cache and refetch from Ollama |
| `/providers info <model>` | Show context window, family, parameters, capabilities for a model (partial match) |
| `/providers init` | Create a default `local-providers.json` config file |
| `/providers reload` | Reload config without restarting Pi |
| `/providers debug on/off` | Toggle debug logging |
| `/providers help` | Show command help |

## Widget

A persistent indicator below the editor shows the current model's metadata and updates live as you switch models or change thinking level:

```
gemma4:12b · gemma4 · 12B
ctx: 262K · thinking: medium    ● vision  ● thinking  ● tools
```

When no model is selected, shows: `○ local models: 21 registered`.

`/providers status` output looks like:

```
Local Providers Status:
Sync on startup: yes
Add to scope: yes
Cleanup stale: no
Debug: off

Providers:
  ollama: watching (http://127.0.0.1:11434)

Registered Ollama models: 21
  5 vision | 7 reasoning | 21 tools
  text-only: 0
```

## Configuration

Config file: `~/.pi/agent/local-providers.json` (global) or `./.pi/local-providers.json` (project, overrides global).

```json
{
  "debug": false,
  "syncOnStartup": true,
  "addToScope": true,
  "providers": {
    "ollama": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:11434",
      "cleanupStale": false,
      "cacheTtlHours": 24
    }
  }
}
```

### Provider fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Set to `false` to skip this provider |
| `baseUrl` | string | `http://127.0.0.1:11434` | Ollama HTTP API root |
| `cleanupStale` | boolean | `false` | Remove this provider's entries from `enabledModels` if the model is no longer in Ollama |
| `cacheTtlHours` | number | `24` | How long to cache `/api/show` results. `0` = always refetch |

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `debug` | boolean | `false` | Log extra info on session start |
| `syncOnStartup` | boolean | `true` | Run discovery during the async factory (before `session_start`) |
| `addToScope` | boolean | `true` | Push discovered models into `settings.json` `enabledModels` |

## Capability detection

The extension reads each model's `/api/show` response to extract:

- **context window** — from `model_info.<arch>.context_length` (1M+ for models that support it)
- **vision** — from `capabilities: ["vision"]`
- **reasoning** — from `capabilities: ["thinking"]` or `["reasoning"]`
- **tools** — from `capabilities: ["tools"]`
- **parameter size / family** — for the displayed model name

If `/api/show` is unavailable, it falls back to name-based heuristics (e.g. `vl`, `vision`, `ocr` → vision; `thinking`, `r1`, `qwq` → reasoning).

## Cache

Capability data is cached at `~/.pi/agent/ollama-model-cache.json`. Entries older than `cacheTtlHours` are refetched on the next sync. Use `/providers sync --force` to bypass the cache.

## Troubleshooting

**Models show in `--list-models` but not in the model picker**

`addToScope: true` writes to `settings.json` `enabledModels` during `session_start`. If you started a session before installing the extension, restart the session (or run `/providers sync` and reload).

**"Ollama not reachable" warnings on startup**

Ollama isn't running, or the `baseUrl` is wrong. Check with:

```bash
curl http://127.0.0.1:11434/api/tags
```

**Capabilities seem wrong for a model**

Run `/providers sync --force` to bypass the cache. If still wrong, check what `/api/show` returns directly:

```bash
curl -X POST http://127.0.0.1:11434/api/show \
  -H 'content-type: application/json' \
  -d '{"name": "gemma4:12b"}'
```

**Stale entries in `enabledModels` after deleting models from Ollama**

Set `cleanupStale: true` in the provider config, then `/providers sync`.

## How it works

The extension uses Pi's async extension factory. On startup:

1. Async factory queries Ollama's `/api/tags` and registers the provider via `pi.registerProvider()` — models are available **immediately** with no `/reload` needed.
2. Per-model `/api/show` calls populate `contextWindow`, `input` (text/image), `reasoning`, and `tools` from the authoritative API.
3. Capability results are cached to `~/.pi/agent/ollama-model-cache.json` (TTL configurable; default 24h).
4. During `session_start`, the extension writes the discovered models into `settings.json` `enabledModels` so they appear in the model picker.

## License

MIT
