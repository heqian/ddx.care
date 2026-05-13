import { AsyncLocalStorage } from "node:async_hooks";

interface CacheContext {
  cachedUrls: Set<string>;
}

const asyncLocalStorage = new AsyncLocalStorage<CacheContext>();

export function runWithCacheTracking<T>(fn: () => Promise<T>): Promise<T> {
  return asyncLocalStorage.run({ cachedUrls: new Set() }, fn);
}

export function markCacheHit(url: string): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.cachedUrls.add(url);
  }
}

export function consumeCacheHits(): boolean {
  const store = asyncLocalStorage.getStore();
  if (!store) return false;
  const hadHits = store.cachedUrls.size > 0;
  store.cachedUrls.clear();
  return hadHits;
}
