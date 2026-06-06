import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type {
  ModelDiscoveryConfig,
  ModelProfile,
  TierConfig,
  ConfigLoadResult,
  ParsedConfigFile,
  ModelTier,
} from './types';

export const MODEL_TIERS = ['high', 'medium', 'low'] as const;

export const FALLBACK_CONFIG: ModelDiscoveryConfig = {
  defaultProfile: 'auto',
  debug: false,
  syncOnStartup: true,
  addToScope: true,
  profiles: {
    auto: {
      high: { model: 'openai/gpt-4-turbo-preview', thinking: 'off' },
      medium: { model: 'google/gemini-pro', thinking: 'off' },
      low: { model: 'anthropic/claude-3-haiku-20240307', thinking: 'off' },
    },
  },
};

export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isThinkingLevel = (value: unknown): value is ThinkingLevel =>
  typeof value === 'string' && THINKING_LEVELS.includes(value as ThinkingLevel);

export const isModelTier = (value: unknown): value is ModelTier =>
  value === 'high' || value === 'medium' || value === 'low';

export const parseConfigFile = (path: string): ParsedConfigFile => {
  if (!existsSync(path)) {
    return { config: {}, warnings: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!isObjectRecord(parsed)) {
      return {
        config: {},
        warnings: [`Ignored discovery config at ${path}: expected a JSON object.`],
      };
    }
    return { config: parsed as Partial<ModelDiscoveryConfig>, warnings: [] };
  } catch (error) {
    return {
      config: {},
      warnings: [
        `Failed to parse discovery config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

export const mergeConfig = (
  base: ModelDiscoveryConfig,
  override: Partial<ModelDiscoveryConfig>,
): ModelDiscoveryConfig => {
  const mergedProfiles: Record<string, ModelProfile> = { ...base.profiles };
  for (const [name, profile] of Object.entries(override.profiles ?? {})) {
    const existing = mergedProfiles[name];
    const nextProfile = profile as Partial<ModelProfile>;
    mergedProfiles[name] = {
      high: {
        ...(existing?.high ?? FALLBACK_CONFIG.profiles.auto.high),
        ...(nextProfile.high ?? {}),
      },
      medium: {
        ...(existing?.medium ?? FALLBACK_CONFIG.profiles.auto.medium),
        ...(nextProfile.medium ?? {}),
      },
      low: {
        ...(existing?.low ?? FALLBACK_CONFIG.profiles.auto.low),
        ...(nextProfile.low ?? {}),
      },
    };
  }
  return {
    defaultProfile: override.defaultProfile ?? base.defaultProfile,
    debug: override.debug ?? base.debug,
    syncOnStartup: override.syncOnStartup ?? base.syncOnStartup,
    addToScope: override.addToScope ?? base.addToScope,
    profiles: mergedProfiles,
  };
};

export const parseCanonicalModelRef = (
  value: string,
): { provider: string; modelId: string } => {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model reference "${value}". Expected "provider/model".`,
    );
  }
  const provider = value.slice(0, slashIndex).trim();
  const modelId = value.slice(slashIndex + 1).trim();
  if (!provider || !modelId) {
    throw new Error(
      `Invalid model reference "${value}". Expected "provider/model".`,
    );
  }
  return { provider, modelId };
};

export const normalizeTierConfig = (
  value: unknown,
  fallback: TierConfig,
  profileName: string,
  tier: ModelTier,
  warnings: string[],
): TierConfig => {
  if (!isObjectRecord(value)) {
    warnings.push(
      `Profile "${profileName}" has invalid ${tier} tier config. Falling back to ${fallback.model}.`,
    );
    return { ...fallback };
  }

  const model = typeof value.model === 'string' ? value.model.trim() : '';
  let parsedModel = fallback.model;
  if (!model) {
    warnings.push(
      `Profile "${profileName}" ${tier} tier is missing a model. Falling back to ${fallback.model}.`,
    );
  } else {
    try {
      parseCanonicalModelRef(model);
      parsedModel = model;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  const thinking = isThinkingLevel(value.thinking)
    ? value.thinking
    : fallback.thinking;
  if (value.thinking !== undefined && !isThinkingLevel(value.thinking)) {
    warnings.push(
      `Profile "${profileName}" ${tier} tier has invalid thinking level. Falling back to ${fallback.thinking ?? 'medium'}.`,
    );
  }

  return { model: parsedModel, thinking };
};

export const normalizeConfig = (raw: ModelDiscoveryConfig): ConfigLoadResult => {
  const warnings: string[] = [];
  const normalizedProfiles: Record<string, ModelProfile> = {};
  const fallbackAuto = FALLBACK_CONFIG.profiles.auto;

  for (const [name, profile] of Object.entries(raw.profiles ?? {})) {
    normalizedProfiles[name] = {
      high: normalizeTierConfig(
        profile?.high,
        fallbackAuto.high,
        name,
        'high',
        warnings,
      ),
      medium: normalizeTierConfig(
        profile?.medium,
        fallbackAuto.medium,
        name,
        'medium',
        warnings,
      ),
      low: normalizeTierConfig(
        profile?.low,
        fallbackAuto.low,
        name,
        'low',
        warnings,
      ),
    };
  }

  if (Object.keys(normalizedProfiles).length === 0) {
    normalizedProfiles.auto = fallbackAuto;
    warnings.push(
      'No valid discovery profiles found. Falling back to the built-in auto profile.',
    );
  }

  let defaultProfile =
    typeof raw.defaultProfile === 'string' && raw.defaultProfile.trim()
      ? raw.defaultProfile.trim()
      : undefined;
  if (!defaultProfile || !normalizedProfiles[defaultProfile]) {
    const fallbackProfile = normalizedProfiles[
      FALLBACK_CONFIG.defaultProfile ?? 'auto'
    ]
      ? (FALLBACK_CONFIG.defaultProfile ?? 'auto')
      : Object.keys(normalizedProfiles).sort()[0];
    if (defaultProfile && !normalizedProfiles[defaultProfile]) {
      warnings.push(
        `Default discovery profile "${defaultProfile}" was not found. Falling back to "${fallbackProfile}".`,
      );
    }
    defaultProfile = fallbackProfile;
  }

  return {
    config: {
      defaultProfile,
      debug: typeof raw.debug === 'boolean' ? raw.debug : false,
      syncOnStartup: typeof raw.syncOnStartup === 'boolean' ? raw.syncOnStartup : true,
      addToScope: typeof raw.addToScope === 'boolean' ? raw.addToScope : true,
      profiles: normalizedProfiles,
    },
    warnings,
  };
};

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
    warnings: [
      ...globalResult.warnings,
      ...projectResult.warnings,
      ...normalized.warnings,
    ],
  };
};

export const profileNames = (config: ModelDiscoveryConfig): string[] => {
  return Object.keys(config.profiles).sort();
};

export const resolveProfileName = (
  config: ModelDiscoveryConfig,
  requested?: string,
): string => {
  if (requested && config.profiles[requested]) {
    return requested;
  }
  if (config.defaultProfile && config.profiles[config.defaultProfile]) {
    return config.defaultProfile;
  }
  return profileNames(config)[0] ?? 'auto';
};
