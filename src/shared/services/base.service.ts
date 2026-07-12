
export interface ServiceResponse<T> {
  success: boolean;
  data: T | null;
  error: any;
}

export const safeCall = async <T>(promise: PromiseLike<any> | (() => PromiseLike<any>)): Promise<ServiceResponse<T>> => {
  try {
    const res = typeof promise === 'function' ? await promise() : await promise;
    if (res && typeof res === 'object' && 'error' in res && res.error) {
      return { success: false, data: null, error: res.error };
    }
    return { success: true, data: (res && typeof res === 'object' && 'data' in res ? res.data : res) as T, error: null };
  } catch (err) {
    return { success: false, data: null, error: err };
  }
};

interface CacheEntry {
  data: any;
  timestamp: number;
}

const queryCache = new Map<string, CacheEntry>();
const pendingPromises = new Map<string, PromiseLike<any>>();

/**
 * ponytail: caching and deduplication to avoid duplicate network calls.
 * Caches successful responses in memory for ttlMs.
 * Deduplicates in-flight calls to the same fetchFn if they share a cacheKey.
 */
export const cachedSafeCall = async <T>(
  cacheKey: string,
  ttlMs: number,
  fetchFn: () => PromiseLike<any>
): Promise<ServiceResponse<T>> => {
  const cached = queryCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp < ttlMs)) {
    return { success: true, data: cached.data as T, error: null };
  }

  let promise = pendingPromises.get(cacheKey);
  if (!promise) {
    promise = fetchFn();
    pendingPromises.set(cacheKey, promise);
  }

  try {
    const res = await promise;
    pendingPromises.delete(cacheKey);
    
    const response = await safeCall<T>(Promise.resolve(res));
    if (response.success && response.data !== null) {
      queryCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    }
    return response;
  } catch (err) {
    pendingPromises.delete(cacheKey);
    return { success: false, data: null, error: err };
  }
};

/** Clear query cache manually (e.g. after mutations) */
export const clearQueryCache = (keyPattern?: string) => {
  if (!keyPattern) {
    queryCache.clear();
    return;
  }
  for (const key of queryCache.keys()) {
    if (key.includes(keyPattern)) {
      queryCache.delete(key);
    }
  }
};
