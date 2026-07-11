
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
