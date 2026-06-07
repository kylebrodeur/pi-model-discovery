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
/** Bump when ModelCapabilities shape changes so old caches get re-fetched. */
const CACHE_VERSION = 2;

interface VersionedCache {
  version: number;
  entries: CapabilityCache;
}

export const getCachePath = (): string => join(getAgentDir(), CACHE_FILENAME);

const readVersioned = (): VersionedCache | null => {
  const path = getCachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    // Handle both new versioned format and legacy flat format
    if (typeof raw === 'object' && raw !== null && 'version' in raw) {
      return raw as VersionedCache;
    }
    return { version: 1, entries: raw as CapabilityCache };
  } catch {
    return null;
  }
};

export const readCache = (): CapabilityCache => {
  const v = readVersioned();
  if (!v) return {};
  if (v.version !== CACHE_VERSION) return {}; // version mismatch → rebuild
  return v.entries;
};

export const writeCache = (cache: CapabilityCache): void => {
  const wrapped: VersionedCache = { version: CACHE_VERSION, entries: cache };
  try {
    writeFileSync(getCachePath(), JSON.stringify(wrapped, null, 2));
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
