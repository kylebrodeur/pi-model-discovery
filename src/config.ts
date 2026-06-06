import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryConfig, ConfigLoadResult, ParsedConfigFile } from './types';

export const FALLBACK_CONFIG: ModelDiscoveryConfig = {
  debug: false,
  syncOnStartup: true,
  addToScope: true,
  providers: { ollama: { enabled: true, baseUrl: 'http://127.0.0.1:11434' } },
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseConfigFile = (path: string): ParsedConfigFile => {
  if (!existsSync(path)) {
    return { config: {}, warnings: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!isObjectRecord(parsed)) {
      return { config: {}, warnings: [`Ignored config at ${path}: expected a JSON object.`] };
    }
    return { config: parsed as Partial<ModelDiscoveryConfig>, warnings: [] };
  } catch (error) {
    return {
      config: {},
      warnings: [`Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const mergeConfig = (
  base: ModelDiscoveryConfig,
  override: Partial<ModelDiscoveryConfig>,
): ModelDiscoveryConfig => ({
  debug: override.debug ?? base.debug,
  syncOnStartup: override.syncOnStartup ?? base.syncOnStartup,
  addToScope: override.addToScope ?? base.addToScope,
  providers: override.providers ?? base.providers,
});

export const normalizeConfig = (raw: ModelDiscoveryConfig): ConfigLoadResult => ({
  config: {
    debug: typeof raw.debug === 'boolean' ? raw.debug : FALLBACK_CONFIG.debug,
    syncOnStartup: typeof raw.syncOnStartup === 'boolean' ? raw.syncOnStartup : FALLBACK_CONFIG.syncOnStartup,
    addToScope: typeof raw.addToScope === 'boolean' ? raw.addToScope : FALLBACK_CONFIG.addToScope,
    providers: raw.providers ?? FALLBACK_CONFIG.providers,
  },
  warnings: [],
});

export const loadModelDiscoveryConfig = (cwd: string): ConfigLoadResult => {
  const globalPath = join(getAgentDir(), 'model-discovery.json');
  const projectPath = join(cwd, '.pi', 'model-discovery.json');
  const globalResult = parseConfigFile(globalPath);
  const projectResult = parseConfigFile(projectPath);
  const merged = mergeConfig(
    mergeConfig(FALLBACK_CONFIG, globalResult.config),
    projectResult.config,
  );
  const normalized = normalizeConfig(merged);
  return {
    config: normalized.config,
    warnings: [...globalResult.warnings, ...projectResult.warnings, ...normalized.warnings],
  };
};
