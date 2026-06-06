import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

// TYPES
interface OllamaListEntry {
  name: string;
}
interface ModelsJson {
  providers: {
    ollama?: {
      models: { id: string }[];
    };
  };
}
interface SyncConfig {
  syncOnStartup: boolean;
  addToScope: boolean;
}
export interface SyncResult {
  added: string[];
  message: string;
  success: boolean;
}

// OLLAMA DISCOVERY LOGIC
const parseOllamaList = (output: string): OllamaListEntry[] => {
  return output.trim().split('\n').slice(1).map(line => ({ name: line.split(/\s+/)[0] }));
};

const inferCapabilities = (modelName: string): Record<string, any> => {
  const lower = modelName.toLowerCase();
  const entry: Record<string, any> = { contextWindow: 128000 };
  if (['vl', 'vision', 'ocr'].some(kw => lower.includes(kw))) {
    entry.input = ['text', 'image'];
  }
  if (['gemma2', 'qwen2', 'llama3'].some(kw => lower.includes(kw))) {
    entry.contextWindow = 262144;
  }
  return entry;
};

// SETTINGS & MODELS JSON FILE OPERATIONS
const getSettingsPath = () => join(getAgentDir(), 'settings.json');
const getModelsJsonPath = () => join(getAgentDir(), 'models.json');

const readJsonFile = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
};

const writeJsonFile = (path: string, data: any): void => {
  writeFileSync(path, JSON.stringify(data, null, 2));
};

// CORE SYNC FUNCTION
export const performSync = async (pi: ExtensionAPI, config: SyncConfig): Promise<SyncResult> => {
  let ollamaOutput: string;
  try {
    const result = await pi.exec('ollama', ['list'], { timeout: 10000 });
    if (result.code !== 0) throw new Error('Ollama not available');
    ollamaOutput = result.stdout;
  } catch {
    return { added: [], message: 'Ollama not available or timed out.', success: false };
  }

  const discoveredModels = parseOllamaList(ollamaOutput);
  if (discoveredModels.length === 0) {
    return { added: [], message: 'No local Ollama models found.', success: true };
  }

  const modelsJson = readJsonFile<ModelsJson>(getModelsJsonPath());
  if (!modelsJson) {
    return { added: [], message: 'Could not read models.json.', success: false };
  }

  modelsJson.providers.ollama ??= { models: [] };
  const existingModelIds = new Set(modelsJson.providers.ollama.models.map(m => m.id));
  const newModels: string[] = [];

  for (const model of discoveredModels) {
    if (!existingModelIds.has(model.name)) {
      modelsJson.providers.ollama.models.push({ id: model.name, ...inferCapabilities(model.name) });
      newModels.push(model.name);
    }
  }

  if (newModels.length === 0) {
    return { added: [], message: 'All local Ollama models are already configured.', success: true };
  }

  writeJsonFile(getModelsJsonPath(), modelsJson);

  if (config.addToScope) {
    const settings = readJsonFile<any>(getSettingsPath()) ?? {};
    const newModelRefs = newModels.map(name => `ollama/${name}`);
    settings.enabledModels = [...new Set([...(settings.enabledModels ?? []), ...newModelRefs])];
    writeJsonFile(getSettingsPath(), settings);
  }

  return {
    added: newModels,
    message: `Added ${newModels.length} new Ollama model(s). Run /reload to use them.`,
    success: true,
  };
};
