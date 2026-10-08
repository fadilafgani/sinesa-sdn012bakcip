/**
 * SINESA REST API Client
 * Replaces Supabase HTTP client with a lightweight, secure Fetch wrapper.
 * Features:
 * - GET, POST, PUT, PATCH, DELETE
 * - Bearer Authorization injection
 * - Credentials included for HttpOnly refresh cookie handling
 * - Centralized JSON parsing & error normalization
 * - Automatic 401 interception & silent token refresh
 * - Request queueing during refresh
 * - Session expiration dispatch
 */

import type { ServiceResponse } from '@/shared/services/base.service';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

export type SessionExpiredListener = () => void;

class ApiClient {
  private accessToken: string | null = null;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;
  private sessionExpiredListeners: Set<SessionExpiredListener> = new Set();

  /**
   * Determine base API URL
   */
  private getBaseUrl(): string {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      return envUrl.replace(/\/+$/, '');
    }
    return '/api';
  }

  /**
   * Set the current active access token (kept in memory & localStorage)
   */
  public setAccessToken(token: string | null): void {
    this.accessToken = token;
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          localStorage.setItem('sinesa_access_token', token);
        } else {
          localStorage.removeItem('sinesa_access_token');
        }
      } catch {}
    }
  }

  /**
   * Retrieve current active access token
   */
  public getAccessToken(): string | null {
    if (!this.accessToken && typeof window !== 'undefined') {
      try {
        this.accessToken = localStorage.getItem('sinesa_access_token');
      } catch {}
    }
    return this.accessToken;
  }

  /**
   * Register a listener when a session becomes invalid / expired
   */
  public onSessionExpired(listener: SessionExpiredListener): () => void {
    this.sessionExpiredListeners.add(listener);
    return () => {
      this.sessionExpiredListeners.delete(listener);
    };
  }

  /**
   * Dispatch session expiration event
   */
  private notifySessionExpired(): void {
    this.setAccessToken(null);
    for (const listener of this.sessionExpiredListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[API_CLIENT] Error in onSessionExpired listener:', err);
      }
    }
  }

  /**
   * Silent token refresh via HttpOnly cookie
   */
  public async refreshTokens(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const url = `${this.getBaseUrl()}/auth/refresh`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'include',
        });

        if (!res.ok) {
          this.notifySessionExpired();
          return null;
        }

        const data = await res.json();
        const newAccessToken = data?.data?.access_token;
        if (data?.success && newAccessToken) {
          this.setAccessToken(newAccessToken);
          return newAccessToken;
        }

        this.notifySessionExpired();
        return null;
      } catch (err) {
        console.error('[API_CLIENT] Refresh token request failed:', err);
        this.notifySessionExpired();
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Core request engine
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions & { method: string; body?: any }
  ): Promise<ServiceResponse<T>> {
    const { params, skipAuth = false, _isRetry = false, method, body, headers: customHeaders, ...customInit } = options;

    // Build URL with query params
    let url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.getBaseUrl()}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    // Prepare headers
    const headers = new Headers(customHeaders);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    let requestBody: any = body;
    if (body !== undefined && body !== null) {
      if (body instanceof FormData) {
        // Let browser set multipart boundary
      } else if (typeof body === 'string') {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        requestBody = body;
      } else {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        requestBody = JSON.stringify(body);
      }
    }

    // Attach Bearer token if available and not skipped
    if (!skipAuth && this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    console.log('API_REQUEST', method.toUpperCase(), url, body || params || '');

    try {
      const res = await fetch(url, {
        ...customInit,
        method,
        headers,
        body: requestBody,
        credentials: 'include', // Transmits secure HttpOnly cookie
      });

      // Handle 401 Unauthorized with automatic token refresh
      const isAuthEndpoint =
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/refresh') ||
        endpoint.includes('/auth/register');

      if (res.status === 401 && !skipAuth && !_isRetry && !isAuthEndpoint) {
        const refreshedToken = await this.refreshTokens();
        if (refreshedToken) {
          // Retry original request once with new access token
          return this.request<T>(endpoint, {
            ...options,
            _isRetry: true,
          });
        } else {
          return {
            success: false,
            data: null,
            error: 'Sesi telah berakhir. Silakan masuk kembali.',
          };
        }
      }

      // Parse JSON response
      const text = await res.text();
      let resJson: any = null;
      if (text) {
        try {
          resJson = JSON.parse(text);
        } catch {
          resJson = text;
        }
      }

      // Check HTTP error status
      if (!res.ok) {
        const errorMessage =
          (resJson && typeof resJson === 'object' && resJson.error) ||
          (resJson && typeof resJson === 'object' && resJson.message) ||
          res.statusText ||
          `HTTP Error ${res.status}`;

        return {
          success: false,
          data: null,
          error: errorMessage,
        };
      }

      // Check standardized { success, data, error } backend envelope
      if (resJson && typeof resJson === 'object' && 'success' in resJson) {
        if (!resJson.success) {
          return {
            success: false,
            data: null,
            error: resJson.error || 'Terjadi kesalahan pada pemrosesan permintaan.',
          };
        }
        return {
          success: true,
          data: resJson.data !== undefined ? (resJson.data as T) : (null as any),
          error: null,
        };
      }

      // Non-envelope response
      return {
        success: true,
        data: resJson as T,
        error: null,
      };

    } catch (networkError: any) {
      console.error(`[API_CLIENT] Request failed: ${method} ${url}`, networkError);
      return {
        success: false,
        data: null,
        error: networkError?.message || 'Gagal terhubung ke server. Periksa koneksi Anda.',
      };
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<ServiceResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<ServiceResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  public put<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<ServiceResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  public patch<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<ServiceResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<ServiceResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
