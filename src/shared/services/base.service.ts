import { Logger } from '@/shared/utils/logger';

export interface ServiceResponse<T> {
  success: boolean;
  data: T | null;
  error: any;
}

function getCallerInfo(): { serviceName: string; methodName: string } {
  try {
    const stack = new Error().stack;
    if (!stack) return { serviceName: 'Service', methodName: 'safeCall' };
    
    const lines = stack.split('\n');
    let callerLine = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (
        !line.includes('safeCall') && 
        !line.includes('getCallerInfo') && 
        !line.includes('BaseService')
      ) {
        callerLine = line;
        break;
      }
    }
    
    if (!callerLine) return { serviceName: 'Service', methodName: 'safeCall' };
    
    // Matches "at ServiceName.methodName" or "at methodName"
    const match = callerLine.match(/at\s+(?:async\s+)?([^\s(]+)/);
    if (match && match[1]) {
      const name = match[1];
      if (name.includes('.')) {
        const parts = name.split('.');
        return { serviceName: parts[parts.length - 2], methodName: parts[parts.length - 1] };
      }
      return { serviceName: 'Service', methodName: name };
    }
  } catch (_) {}
  return { serviceName: 'Service', methodName: 'safeCall' };
}

export const safeCall = async <T>(
  promise: PromiseLike<any> | (() => PromiseLike<any>)
): Promise<ServiceResponse<T>> => {
  const caller = getCallerInfo();
  const start = performance.now();
  
  try {
    const res = typeof promise === 'function' ? await promise() : await promise;
    const duration = performance.now() - start;
    
    if (res && typeof res === 'object' && 'error' in res && res.error) {
      Logger.error(`${caller.serviceName}.${caller.methodName} failed`, res.error);
      return { success: false, data: null, error: res.error };
    }
    
    const data = (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
    Logger.perf(`${caller.serviceName}.${caller.methodName} success`, duration);
    return { success: true, data, error: null };
  } catch (err) {
    const duration = performance.now() - start;
    Logger.error(`${caller.serviceName}.${caller.methodName} threw exception after ${duration.toFixed(1)}ms`, err);
    return { success: false, data: null, error: err };
  }
};

interface CacheEntry {
  data: any;
  timestamp: number;
}

const queryCache = new Map<string, CacheEntry>();
const pendingPromises = new Map<string, PromiseLike<any>>();

export const cachedSafeCall = async <T>(
  cacheKey: string,
  ttlMs: number,
  fetchFn: () => PromiseLike<any>
): Promise<ServiceResponse<T>> => {
  const caller = getCallerInfo();
  const cached = queryCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp < ttlMs)) {
    Logger.perf(`${caller.serviceName}.${caller.methodName} (CACHE HIT: ${cacheKey})`, 0);
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
    Logger.error(`${caller.serviceName}.${caller.methodName} (CACHE FETCH) failed for key ${cacheKey}`, err);
    return { success: false, data: null, error: err };
  }
};

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

export const BaseService = {
  safeCall,
  cachedSafeCall,
  clearQueryCache
};
export default BaseService;
