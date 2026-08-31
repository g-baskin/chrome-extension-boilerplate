import type { FinderRequest, FinderSnapshot } from "./types";

export function createWeakExtractorCache<K extends object, F, V>() {
  const cache = new WeakMap<K, { fingerprint: F; value: V }>();
  return {
    get(key: K, fingerprint: F, extract: () => V): V {
      const cached = cache.get(key);
      if (cached && Object.is(cached.fingerprint, fingerprint)) return cached.value;
      const value = extract();
      cache.set(key, { fingerprint, value });
      return value;
    },
  };
}

export function respondToFinderRequest(request: FinderRequest, snapshot: FinderSnapshot, rescan: () => FinderSnapshot, dirty = false): FinderSnapshot {
  return request.type === "GET_SOCIAL_FINDINGS" && !dirty ? snapshot : rescan();
}
