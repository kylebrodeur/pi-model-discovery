# pi-model-discovery

A [Pi](https://pi.dev) extension that auto-discovers local model providers (Ollama first) and registers their models with Pi on startup — no `/reload` required.

## What it does

On every Pi session start, this extension:

1. Queries your configured local provider(s) for installed models
2. Pulls per-model metadata (context window, vision/reasoning/tools capabilities) from Ollama's `/api/show` endpoint
3. Registers all discovered models via Pi's `registerProvider()` so they're immediately available
4. Optionally adds them to `enabledModels` in `settings.json`
5. Caches capability data to avoid hammering `/api/show` on every startup

## Install

```bash
pi install npm:@kylebrodeur/pi-model-discovery
```

## Commands

| Command | Description |
|---------|-------------|
| `/providers status` | Show current config, registered models, and capability breakdown |
| `/providers sync` | Re-run the discovery sync (uses cache) |
| `/providers sync --force` | Bypass the capability cache and refetch from Ollama |
| `/providers init` | Create a default `local-providers.json` config file |
| `/providers reload` | Reload config without restarting Pi |
| `/providers debug on/off` | Toggle debug logging |
| `/providers help` | Show command help |

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

## License

MIT
