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
| `/providers info [model]` | Show model card (defaults to current model) |
| `/providers card` | Open the model card popup for the current model |
| `/providers footer on/off` | Toggle the footer status indicator |
| `/providers init` | Create a default `local-providers.json` config file |
| `/providers reload` | Reload config without restarting Pi |
| `/providers debug on/off` | Toggle debug logging |
| `/providers help` | Show command help |

## Footer status

A compact indicator in pi's footer that complements (not duplicates) the built-in model display. It shows only what pi doesn't already show — capabilities and special variant badges, plus context window size:

```
☁ vision thinking tools  ctx 524K
```

- `☁` cloud/remote model
- `⚡` QAT (Quantization-Aware Training, e.g. Gemma 4)
- `◇` embedding model
- `vis thi tls` — vision / thinking / tools (green = supported)
- `ctx 524K` — context window size (not usage; pi's bar shows usage)

Toggle with `/providers footer on/off` or set in config.

## Model card popup

Full details for the current model, opened as a popup. Triggered by:

- **Keyboard shortcut**: `ctrl+i`
- **Slash command**: `/providers card` (current model) or `/providers info [model]` (any model)

```
minimax-m3:cloud ☁ cloud

minimax · 550B

context     524K tokens
size        384B (remote)
digest      6d55374b63bb

● vision   ● thinking   ● tools
```

Press Escape to close.
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
| `showFooterStatus` | boolean | `true` | Show the footer status indicator with capabilities and context. Use `/providers footer off` to disable. |

## Capability detection

Starting with Ollama 0.30, all metadata is available directly from `/api/tags` — no separate `/api/show` call needed:

- **context window** — from `details.context_length` (1M+ for models that support it)
- **vision** — from `capabilities: ["vision"]`
- **reasoning** — from `capabilities: ["thinking"]` or `["reasoning"]`
- **tools** — from `capabilities: ["tools"]`
- **embedding** — from `capabilities: ["embedding"]`
- **parameter size, family, quantization, format** — from `details.*`
- **size, digest, modified_at** — from top-level tag fields
- **remote/cloud** — when `remote_model`/`remote_host` are set
- **QAT** — detected from `-qat` suffix (Gemma 4 quantization-aware training)

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
