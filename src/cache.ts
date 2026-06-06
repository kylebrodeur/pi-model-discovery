import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ModelCapabilities } from './sync';

interface CachedEntry extends ModelCapabilities {
  cachedAt: number;
}

export type CapabilityCache = Record<string, CachedEntry>;

const CACHE_FILENAME = 'ollama-model-cache.json';
const DEFAULT_TTL_HOURS = 24;

export const getCachePath = (): string => join(getAgentDir(), CACHE_FILENAME);

export const readCache = (): CapabilityCache => {
  const path = getCachePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CapabilityCache;
  } catch {
    return {};
  }
};

export const writeCache = (cache: CapabilityCache): void => {
  try {
    writeFileSync(getCachePath(), JSON.stringify(cache, null, 2));
  } catch { /* best-effort */ }
};

export const isCacheValid = (entry: CachedEntry | undefined, ttlHours: number): boolean => {
  if (!entry) return false;
  if (ttlHours <= 0) return false;
  const ageMs = Date.now() - entry.cachedAt;
  return ageMs < ttlHours * 60 * 60 * 1000;
};

export const resolveTtl = (configured: number | undefined): number =>
  typeof configured === 'number' ? configured : DEFAULT_TTL_HOURS;

export const updateCacheEntry = (
  cache: CapabilityCache,
  modelName: string,
  caps: ModelCapabilities,
): void => {
  cache[modelName] = { ...caps, cachedAt: Date.now() };
};

export const dropStaleCacheEntries = (
  cache: CapabilityCache,
  liveModelIds: Set<string>,
): void => {
  for (const key of Object.keys(cache)) {
    if (!liveModelIds.has(key)) delete cache[key];
  }
};
