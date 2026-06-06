import type { ModelDiscoveryState } from './types';

export const isModelDiscoveryState = (value: unknown): value is ModelDiscoveryState => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as any;
  return typeof v.enabled === 'boolean' && typeof v.timestamp === 'number';
};

export const buildPersistedState = (
  enabled: boolean,
  debugEnabled: boolean,
): ModelDiscoveryState => ({
  enabled,
  debugEnabled,
  timestamp: Date.now(),
});
