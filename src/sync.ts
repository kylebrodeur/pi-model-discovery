import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { SyncConfig } from './types';

interface OllamaTagEntry { name: string; model: string; size: number }
interface OllamaTagsResponse { models: OllamaTagEntry[] }

const inferCapabilities = (modelName: string): { reasoning?: boolean; input?: string[]; contextWindow?: number } => {
  const lower = modelName.toLowerCase();
  const caps: { reasoning?: boolean; input?: string[]; contextWindow?: number } = { contextWindow: 128000 };
  if (['vl', 'vision', 'ocr'].some(kw => lower.includes(kw))) caps.input = ['text', 'image'];
  if (['thinking', 'reason', 'cascade', 'deepseek'].some(kw => lower.includes(kw))) caps.reasoning = true;
  return caps;
};

export interface SyncResult {
  added: string[];
  message: string;
  success: boolean;
}

export const performSync = async (
  pi: ExtensionAPI,
  config: SyncConfig,
): Promise<SyncResult> => {
  const results: SyncResult[] = [];

  if (config.providers.ollama?.enabled !== false) {
    results.push(await syncOllama(pi, config.addToScope, config));
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

const syncOllama = async (pi: ExtensionAPI, addToScope: boolean, config: SyncConfig): Promise<SyncResult> => {
  const baseUrl = config.providers.ollama?.baseUrl ?? 'http://127.0.0.1:11434';
  const apiUrl = baseUrl.replace(/\/$/, '') + '/api/tags';

  let tags: OllamaTagsResponse;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return { added: [], message: `Ollama API returned ${res.status}`, success: false };
    tags = await res.json() as OllamaTagsResponse;
  } catch {
    return { added: [], message: `Ollama not reachable at ${baseUrl}`, success: false };
  }

  if (!tags.models?.length) return { added: [], message: 'No Ollama models found', success: true };

  const models = tags.models.map(m => {
    const caps = inferCapabilities(m.name);
    return {
      id: m.name,
      name: m.name,
      reasoning: caps.reasoning ?? false,
      input: (caps.input ?? ['text']) as ('text' | 'image')[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: caps.contextWindow ?? 128000,
      maxTokens: 4096,
    };
  });

  pi.registerProvider('ollama', {
    baseUrl: baseUrl + '/v1',
    apiKey: 'ollama',
    api: 'openai-completions',
    models,
  });

  if (addToScope) {
    addOllamaToScope(models.map(m => m.id));
  }

  return { added: models.map(m => m.id), message: `${models.length} Ollama model(s) registered.`, success: true };
};

const addOllamaToScope = (modelIds: string[]) => {
  const settingsPath = join(getAgentDir(), 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* ignore */ }

  const refs = modelIds.map(id => `ollama/${id}`);
  settings.enabledModels = [...new Set([...(Array.isArray(settings.enabledModels) ? settings.enabledModels as string[] : []), ...refs])];
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};
