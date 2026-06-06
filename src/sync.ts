import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { SyncConfig } from './types';
import {
  readCache, writeCache, isCacheValid, resolveTtl,
  updateCacheEntry, dropStaleCacheEntries,
} from './cache';

interface OllamaTagEntry { name: string; model: string; size: number }
interface OllamaTagsResponse { models: OllamaTagEntry[] }

interface OllamaShowDetails {
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
}

interface OllamaShowResponse {
  capabilities?: string[];   // e.g. ["completion", "vision", "tools", "thinking"]
  details?: OllamaShowDetails;
  model_info?: Record<string, unknown>;
}

export interface ModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  contextWindow: number;
  parameterSize?: string;
  family?: string;
}

/**
 * Heuristic fallback for capability inference when /api/show is unavailable.
 * Used only as a last resort.
 */
export const inferCapabilitiesFromName = (modelName: string): ModelCapabilities => {
  const lower = modelName.toLowerCase();
  return {
    vision: ['vl', 'vision', 'ocr'].some(kw => lower.includes(kw)),
    reasoning: ['thinking', 'reason', 'cascade', 'deepseek-r1', '-r1', 'qwq'].some(kw => lower.includes(kw)),
    tools: true,
    contextWindow: 128000,
  };
};

/**
 * Pull capabilities from an /api/show response. Falls back to name heuristics
 * if the response is missing fields.
 */
export const capabilitiesFromShow = (
  modelName: string,
  show: OllamaShowResponse | null,
): ModelCapabilities => {
  if (!show) return inferCapabilitiesFromName(modelName);
  const caps = show.capabilities ?? [];
  const info = show.model_info ?? {};

  // context_length lives under the architecture key, e.g. model_info.llama.context_length
  // Walk the object looking for any key ending in `.context_length`.
  let contextWindow = 0;
  for (const [key, value] of Object.entries(info)) {
    if (key.endsWith('.context_length') && typeof value === 'number') {
      contextWindow = Math.max(contextWindow, value);
    }
  }
  if (contextWindow === 0) contextWindow = 128000;

  return {
    vision: caps.includes('vision'),
    reasoning: caps.includes('thinking') || caps.includes('reasoning'),
    tools: caps.includes('tools'),
    contextWindow,
    parameterSize: show.details?.parameter_size,
    family: show.details?.family,
  };
};

export interface SyncResult {
  added: string[];
  message: string;
  success: boolean;
  capabilities?: {
    ollama?: {
      modelIds: string[];
      vision: string[];
      reasoning: string[];
      tools: string[];
    };
  };
}

const fetchOllamaShow = async (baseUrl: string, modelName: string): Promise<OllamaShowResponse | null> => {
  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) return null;
    return await res.json() as OllamaShowResponse;
  } catch {
    return null;
  }
};

export interface SyncOptions {
  syncOnStartup?: boolean;
  addToScope?: boolean;
  providers: SyncConfig['providers'];
  forceRefresh?: boolean;
}

export const performSync = async (
  pi: ExtensionAPI,
  config: SyncOptions,
): Promise<SyncResult> => {
  const results: SyncResult[] = [];

  if (config.providers.ollama?.enabled !== false) {
    results.push(await syncOllama(pi, config));
  }

  const totalAdded = results.flatMap(r => r.added);
  const scopeMsg = config.addToScope ? ' Scope updated.' : '';
  if (!results.every(r => r.success)) {
    const failures = results.filter(r => !r.success);
    return { added: [], message: failures.map(f => f.message).join('; '), success: false };
  }
  if (totalAdded.length > 0) {
    return { added: totalAdded, message: `Registered ${totalAdded.length} model(s).${scopeMsg}`, success: true };
  }
  return { added: [], message: `Already up to date.${scopeMsg}`, success: true };
};

const syncOllama = async (pi: ExtensionAPI, config: SyncOptions): Promise<SyncResult> => {
  const ollamaCfg = config.providers.ollama;
  const baseUrl = (ollamaCfg?.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const ttlHours = resolveTtl(ollamaCfg?.cacheTtlHours);

  let tags: OllamaTagsResponse;
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return { added: [], message: `Ollama API returned ${res.status}`, success: false };
    tags = await res.json() as OllamaTagsResponse;
  } catch {
    return { added: [], message: `Ollama not reachable at ${baseUrl}`, success: false };
  }

  if (!tags.models?.length) {
    return { added: [], message: 'No Ollama models found', success: true, capabilities: { ollama: { modelIds: [], vision: [], reasoning: [], tools: [] } } };
  }

  // Resolve capabilities: cache first, fetch /api/show for cache misses
  const cache = readCache();
  const liveModelIds = new Set(tags.models.map(m => m.name));
  const needsFetch: string[] = [];

  for (const m of tags.models) {
    if (config.forceRefresh) {
      needsFetch.push(m.name);
    } else if (!isCacheValid(cache[m.name], ttlHours)) {
      needsFetch.push(m.name);
    }
  }

  if (needsFetch.length > 0) {
    const fetched = await Promise.all(needsFetch.map(n => fetchOllamaShow(baseUrl, n)));
    for (let i = 0; i < needsFetch.length; i++) {
      const caps = capabilitiesFromShow(needsFetch[i], fetched[i]);
      updateCacheEntry(cache, needsFetch[i], caps);
    }
  }

  // Drop cache entries for models that no longer exist in Ollama
  dropStaleCacheEntries(cache, liveModelIds);
  if (needsFetch.length > 0 || Object.keys(cache).length !== liveModelIds.size) {
    writeCache(cache);
  }

  const modelIds: string[] = [];
  const vision: string[] = [];
  const reasoning: string[] = [];
  const tools: string[] = [];

  const models = tags.models.map((m) => {
    const caps = cache[m.name];
    modelIds.push(m.name);
    if (caps.vision) vision.push(m.name);
    if (caps.reasoning) reasoning.push(m.name);
    if (caps.tools) tools.push(m.name);

    const displayName = caps.parameterSize
      ? `${m.name} (${caps.parameterSize})`
      : m.name;

    return {
      id: m.name,
      name: displayName,
      reasoning: caps.reasoning,
      input: (caps.vision ? ['text', 'image'] : ['text']) as ('text' | 'image')[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: caps.contextWindow,
      maxTokens: 4096,
    };
  });

  pi.registerProvider('ollama', {
    baseUrl: baseUrl + '/v1',
    apiKey: 'ollama',
    api: 'openai-completions',
    models,
  });

  if (config.addToScope) {
    updateOllamaScope(modelIds, ollamaCfg?.cleanupStale === true);
  }

  return {
    added: modelIds,
    message: `${modelIds.length} Ollama model(s) registered.`,
    success: true,
    capabilities: { ollama: { modelIds, vision, reasoning, tools } },
  };
};

const updateOllamaScope = (modelIds: string[], cleanupStale: boolean) => {
  const settingsPath = join(getAgentDir(), 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* ignore */ }

  const existing = Array.isArray(settings.enabledModels) ? settings.enabledModels as string[] : [];
  const refs = modelIds.map(id => `ollama/${id}`);

  let merged: string[];
  if (cleanupStale) {
    merged = [...new Set([...existing.filter(m => !m.startsWith('ollama/')), ...refs])];
  } else {
    merged = [...new Set([...existing, ...refs])];
  }

  if (merged.length !== existing.length || !merged.every((m, i) => m === existing[i])) {
    settings.enabledModels = merged;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
};
