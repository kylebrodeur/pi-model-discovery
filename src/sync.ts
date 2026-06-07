import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { SyncConfig } from './types';
import {
  readCache, writeCache, isCacheValid, resolveTtl,
  updateCacheEntry, dropStaleCacheEntries,
} from './cache';

interface OllamaTagDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
  context_length?: number;
  embedding_length?: number;
}

interface OllamaTagEntry {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: OllamaTagDetails;
  capabilities?: string[];
  /** Cloud/remote model fields (Ollama 0.30+) */
  remote_model?: string;
  remote_host?: string;
}

interface OllamaTagsResponse {
  models: OllamaTagEntry[];
}

export interface ModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  embedding: boolean;
  imageGeneration: boolean;
  contextWindow: number;
  parameterSize?: string;
  family?: string;
  quantization?: string;
  format?: string;
  size: number;
  digest: string;
  modifiedAt: string;
  /** True if the model is hosted remotely (Ollama cloud or other). */
  remote: boolean;
  remoteHost?: string;
  /** True for Quantization-Aware Training variants (e.g. gemma4:12b-it-qat). */
  qat: boolean;
}

const detectQat = (name: string): boolean => name.toLowerCase().endsWith('-qat');

export const inferCapabilitiesFromName = (modelName: string): ModelCapabilities => {
  const lower = modelName.toLowerCase();
  return {
    vision: ['vl', 'vision', 'ocr'].some(kw => lower.includes(kw)),
    reasoning: ['thinking', 'reason', 'cascade', 'deepseek-r1', '-r1', 'qwq'].some(kw => lower.includes(kw)),
    tools: true,
    embedding: lower.includes('embed'),
    imageGeneration: false,
    contextWindow: 128000,
    size: 0,
    digest: '',
    modifiedAt: '',
    remote: lower.includes(':cloud'),
    qat: detectQat(modelName),
  };
};

/** Build a capability snapshot directly from /api/tags (no /api/show call). */
export const capabilitiesFromTag = (tag: OllamaTagEntry): ModelCapabilities => {
  const caps = tag.capabilities ?? [];
  const d = tag.details;
  return {
    vision: caps.includes('vision'),
    reasoning: caps.includes('thinking') || caps.includes('reasoning'),
    tools: caps.includes('tools'),
    embedding: caps.includes('embedding'),
    imageGeneration: caps.includes('image-generation') || caps.includes('image'),
    contextWindow: d?.context_length ?? 0,
    parameterSize: d?.parameter_size,
    family: d?.family,
    quantization: d?.quantization_level,
    format: d?.format,
    size: tag.size ?? 0,
    digest: tag.digest ?? '',
    modifiedAt: tag.modified_at ?? '',
    remote: !!tag.remote_model,
    remoteHost: tag.remote_host,
    qat: detectQat(tag.name),
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
      embedding: string[];
      remote: string[];
      qat: string[];
      contextWindows: Record<string, number>;
      families: Record<string, string>;
      parameterSizes: Record<string, string>;
      quantizations: Record<string, string>;
      formats: Record<string, string>;
      sizes: Record<string, number>;
      digests: Record<string, string>;
      modifiedAt: Record<string, string>;
    };
  };
}

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
    return {
      added: [],
      message: 'No Ollama models found',
      success: true,
      capabilities: {
        ollama: {
          modelIds: [], vision: [], reasoning: [], tools: [], embedding: [], remote: [], qat: [],
          contextWindows: {}, families: {}, parameterSizes: {}, quantizations: {}, formats: {},
          sizes: {}, digests: {}, modifiedAt: {},
        },
      },
    };
  }

  // Ollama 0.30+ returns all the data we need in /api/tags. We still use the
  // cache layer for resilience when the server is briefly unreachable.
  const cache = readCache();
  const liveModelIds = new Set(tags.models.map(m => m.name));
  const needsFetch: string[] = [];

  for (const m of tags.models) {
    if (config.forceRefresh || !isCacheValid(cache[m.name], ttlHours)) {
      needsFetch.push(m.name);
    }
  }

  if (needsFetch.length > 0) {
    for (const name of needsFetch) {
      const tag = tags.models.find(m => m.name === name);
      if (tag) updateCacheEntry(cache, name, capabilitiesFromTag(tag));
    }
  }

  dropStaleCacheEntries(cache, liveModelIds);
  if (needsFetch.length > 0 || Object.keys(cache).length !== liveModelIds.size) {
    writeCache(cache);
  }

  // Build capability lists + per-model maps from the cache (always current).
  const modelIds: string[] = [];
  const vision: string[] = [];
  const reasoning: string[] = [];
  const tools: string[] = [];
  const embedding: string[] = [];
  const remote: string[] = [];
  const qat: string[] = [];
  const contextWindows: Record<string, number> = {};
  const families: Record<string, string> = {};
  const parameterSizes: Record<string, string> = {};
  const quantizations: Record<string, string> = {};
  const formats: Record<string, string> = {};
  const sizes: Record<string, number> = {};
  const digests: Record<string, string> = {};
  const modifiedAt: Record<string, string> = {};

  const models = tags.models.map((m) => {
    const caps = cache[m.name];
    modelIds.push(m.name);
    if (caps.vision) vision.push(m.name);
    if (caps.reasoning) reasoning.push(m.name);
    if (caps.tools) tools.push(m.name);
    if (caps.embedding) embedding.push(m.name);
    if (caps.remote) remote.push(m.name);
    if (caps.qat) qat.push(m.name);
    contextWindows[m.name] = caps.contextWindow;
    if (caps.family) families[m.name] = caps.family;
    if (caps.parameterSize) parameterSizes[m.name] = caps.parameterSize;
    if (caps.quantization) quantizations[m.name] = caps.quantization;
    if (caps.format) formats[m.name] = caps.format;
    if (caps.size) sizes[m.name] = caps.size;
    if (caps.digest) digests[m.name] = caps.digest;
    if (caps.modifiedAt) modifiedAt[m.name] = caps.modifiedAt;

    const displayName = caps.parameterSize
      ? `${m.name} (${caps.parameterSize})`
      : m.name;

    return {
      id: m.name,
      name: displayName,
      reasoning: caps.reasoning,
      thinkingLevelMap: caps.reasoning
        ? { off: null, minimal: 'low', low: 'low', medium: 'medium', high: 'high' }
        : { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null },
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
    capabilities: {
      ollama: {
        modelIds, vision, reasoning, tools, embedding, remote, qat,
        contextWindows, families, parameterSizes, quantizations, formats,
        sizes, digests, modifiedAt,
      },
    },
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
