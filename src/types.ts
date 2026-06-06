export interface OllamaProviderConfig {
  enabled?: boolean;
}

export interface ProviderConfigs {
  ollama?: OllamaProviderConfig;
}

export interface ModelDiscoveryConfig {
  debug?: boolean;
  syncOnStartup?: boolean;
  addToScope?: boolean;
  providers?: ProviderConfigs;
}

export interface ModelDiscoveryState {
  enabled: boolean;
  debugEnabled: boolean;
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
