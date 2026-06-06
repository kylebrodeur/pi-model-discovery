import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { SyncConfig } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OllamaListEntry { name: string }
interface ModelsJson {
  providers: {
    ollama?: { models: { id: string }[] };
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const parseOllamaList = (output: string): OllamaListEntry[] =>
  output.trim().split('\n').slice(1).map(line => ({ name: line.split(/\s+/)[0] }));

const inferCapabilities = (modelName: string): Record<string, any> => {
  const lower = modelName.toLowerCase();
  const entry: Record<string, any> = { contextWindow: 128000 };
  if (['vl', 'vision', 'ocr'].some(kw => lower.includes(kw))) entry.input = ['text', 'image'];
  return entry;
};

const getSettingsPath = () => join(getAgentDir(), 'settings.json');
const getModelsJsonPath = () => join(getAgentDir(), 'models.json');

const readJsonFile = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
};

const writeJsonFile = (path: string, data: any): void => {
  writeFileSync(path, JSON.stringify(data, null, 2));
};

// ─── Public API ─────────────────────────────────────────────────────────────

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

  // ── Ollama provider ──────────────────────────────────────────────────
  if (config.providers.ollama?.enabled !== false) {
    const result = await syncOllama(pi, config.addToScope);
    results.push(result);
  }

  // Combine results
  const totalAdded = results.flatMap(r => r.added);
  if (totalAdded.length > 0) {
    return {
      added: totalAdded,
      message: `Added ${totalAdded.length} model(s): ${totalAdded.join(', ')}. Run /reload to use them.`,
      success: true,
    };
  }

  const allSucceeded = results.every(r => r.success);
  if (!allSucceeded) {
    const failures = results.filter(r => !r.success);
    return { added: [], message: failures.map(f => f.message).join('; '), success: false };
  }

  return { added: [], message: 'All models already up to date.', success: true };
};

// ─── Provider-specific sync ─────────────────────────────────────────────────

const syncOllama = async (pi: ExtensionAPI, addToScope: boolean): Promise<SyncResult> => {
  let output: string;
  try {
    const result = await pi.exec('ollama', ['list'], { timeout: 10000 });
    if (result.code !== 0) return { added: [], message: 'Ollama not available', success: false };
    output = result.stdout;
  } catch {
    return { added: [], message: 'Ollama not available', success: false };
  }

  const discovered = parseOllamaList(output);
  if (discovered.length === 0) return { added: [], message: 'No Ollama models found', success: true };

  const modelsJson = readJsonFile<ModelsJson>(getModelsJsonPath());
  if (!modelsJson) return { added: [], message: 'models.json not found', success: false };

  modelsJson.providers.ollama ??= { models: [] };
  const existing = new Set(modelsJson.providers.ollama.models.map(m => m.id));
  const added: string[] = [];

  for (const m of discovered) {
    if (!existing.has(m.name)) {
      modelsJson.providers.ollama.models.push({ id: m.name, ...inferCapabilities(m.name) });
      added.push(m.name);
    }
  }

  if (added.length === 0) return { added: [], message: 'Ollama models up to date.', success: true };

  writeJsonFile(getModelsJsonPath(), modelsJson);

  if (addToScope) {
    const settings = readJsonFile<any>(getSettingsPath()) ?? {};
    const refs = added.map(name => `ollama/${name}`);
    settings.enabledModels = [...new Set([...(settings.enabledModels ?? []), ...refs])];
    writeJsonFile(getSettingsPath(), settings);
  }

  return { added, message: `${added.length} Ollama model(s) synced.`, success: true };
};
