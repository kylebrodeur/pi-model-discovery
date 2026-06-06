import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

export type ModelTier = 'high' | 'medium' | 'low';

export interface TierConfig {
  model: string;
  thinking?: ThinkingLevel;
}

export interface ModelProfile {
  high: TierConfig;
  medium: TierConfig;
  low: TierConfig;
}

export interface ModelDiscoveryConfig {
  defaultProfile?: string;
  debug?: boolean;
  profiles: Record<string, ModelProfile>;
}

export interface ModelDiscoveryState {
  enabled: boolean;
  selectedProfile: string;
  debugEnabled: boolean;
  widgetEnabled: boolean;
  timestamp: number;
}


export interface ConfigLoadResult {
  config: ModelDiscoveryConfig;
  warnings: string[];
}

export interface ParsedConfigFile {
  config: Partial<ModelDiscoveryConfig>;
  warnings: string[];
}

export interface CustomSessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
}
