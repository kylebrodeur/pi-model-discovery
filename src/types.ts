export interface OllamaProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  cleanupStale?: boolean;
  /** How long to cache per-model /api/show results, in hours. 0 = always refresh. */
  cacheTtlHours?: number;
}

export interface ProviderConfigs {
  ollama?: OllamaProviderConfig;
}

export interface ModelDiscoveryConfig {
  debug?: boolean;
  syncOnStartup?: boolean;
  addToScope?: boolean;
  /** Show the footer status indicator with capabilities + context. Default: true. */
  showFooterStatus?: boolean;
  /** Show the capability labels (vision/thinking/tools) next to their icons. Default: false. */
  showCapLabelText?: boolean;
  /** Show the location/type labels (cloud/QAT/embed) next to their icons. Default: false. */
  showLocationLabels?: boolean;
  providers?: ProviderConfigs;
}

export interface ModelDiscoveryState {
  enabled: boolean;
  debugEnabled: boolean;
  lastSync?: {
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

export interface SyncConfig {
  syncOnStartup: boolean;
  addToScope: boolean;
  providers: ProviderConfigs;
}
