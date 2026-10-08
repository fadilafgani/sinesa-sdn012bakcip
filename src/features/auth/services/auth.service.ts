import { apiClient } from '@/core/api-client';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Profile } from '@/types';
import { useAuthStore } from '../stores/auth-store';

export const AuthService = {
  async signIn(email: string, password: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.signIn', { email });
    const res = await apiClient.post<any>('/auth/login', { email, password });

    if (!res.success || !res.data) {
      const msg = typeof res.error === 'string' ? res.error : (res.error?.message || 'Email atau kata sandi tidak valid.');
      return {
        success: false,
        data: null,
        error: { message: msg },
      };
    }

    const { access_token, user, profile } = res.data;

    if (access_token) {
      apiClient.setAccessToken(access_token);
    }

    // Sync to Zustand Auth Store immediately
    useAuthStore.getState().setUserAndProfile(user, profile);

    return {
      success: true,
      data: {
        access_token,
        user,
        profile,
        session: {
          access_token,
          user,
        },
      },
      error: null,
    };
  },

  async signUp(email: string, password: string, role: string, fullName: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.signUp', { email, role, fullName });
    const res = await apiClient.post<any>('/auth/register', {
      email,
      password,
      role,
      full_name: fullName,
    });

    if (!res.success || !res.data) {
      const msg = typeof res.error === 'string' ? res.error : (res.error?.message || 'Gagal mendaftarkan akun pengguna.');
      return {
        success: false,
        data: null,
        error: { message: msg },
      };
    }

    const { access_token, user, profile } = res.data;

    if (access_token) {
      apiClient.setAccessToken(access_token);
    }

    // Sync to Zustand Auth Store immediately
    useAuthStore.getState().setUserAndProfile(user, profile);

    return {
      success: true,
      data: {
        access_token,
        user,
        profile,
        session: {
          access_token,
          user,
        },
      },
      error: null,
    };
  },

  async signOut(): Promise<ServiceResponse<void>> {
    console.log('[SYNC] AuthService.signOut');
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.warn('[AUTH] Error during backend logout:', err);
    } finally {
      apiClient.setAccessToken(null);
      useAuthStore.getState().setUserAndProfile(null, null);
    }

    return { success: true, data: undefined, error: null };
  },

  async getSession(): Promise<ServiceResponse<any>> {
    // 1. If access token is already available in memory, fetch profile via /auth/me
    if (apiClient.getAccessToken()) {
      const meRes = await apiClient.get<any>('/auth/me');
      if (meRes.success && meRes.data?.user) {
        return {
          success: true,
          data: {
            session: {
              access_token: apiClient.getAccessToken(),
              user: meRes.data.user,
            },
            user: meRes.data.user,
            profile: meRes.data.profile,
          },
          error: null,
        };
      }
    }

    // 2. Otherwise (e.g. browser refresh/reload), recover session using secure HttpOnly cookie
    const refreshRes = await apiClient.post<any>('/auth/refresh');
    if (refreshRes.success && refreshRes.data?.access_token) {
      const { access_token, user, profile } = refreshRes.data;
      apiClient.setAccessToken(access_token);

      return {
        success: true,
        data: {
          session: {
            access_token,
            user,
          },
          user,
          profile,
        },
        error: null,
      };
    }

    return {
      success: false,
      data: null,
      error: refreshRes.error || 'Tidak ada sesi aktif.',
    };
  },

  async refreshSession(): Promise<ServiceResponse<any>> {
    const refreshRes = await apiClient.post<any>('/auth/refresh');
    if (refreshRes.success && refreshRes.data?.access_token) {
      const { access_token, user, profile } = refreshRes.data;
      apiClient.setAccessToken(access_token);
      useAuthStore.getState().setUserAndProfile(user, profile);

      return {
        success: true,
        data: {
          session: {
            access_token,
            user,
          },
          user,
          profile,
        },
        error: null,
      };
    }

    return {
      success: false,
      data: null,
      error: refreshRes.error || 'Gagal memperbarui sesi autentikasi.',
    };
  },

  async resetPassword(email: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.resetPassword', { email });
    // In local PHP setup, password reset is handled by administrator
    return {
      success: true,
      data: { message: 'Silakan hubungi administrator sekolah untuk pengaturan ulang kata sandi.' },
      error: null,
    };
  },

  async getOrCreateProfile(user: any): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] AuthService.getOrCreateProfile', { userId: user?.id });
    try {
      // Try loading user profile from PHP REST API
      const meRes = await apiClient.get<any>('/auth/me');
      if (meRes.success && meRes.data?.profile) {
        return { success: true, data: meRes.data.profile as Profile, error: null };
      }

      // Safe fallback profile from user metadata if me endpoint didn't return profile
      const userRole = (user?.user_metadata?.role || user?.role || 'student') as any;
      const fullName = user?.user_metadata?.full_name || user?.full_name || user?.email?.split('@')[0] || 'Pengguna Sinesa';

      const fallbackProfile: Profile = {
        id: user?.id || 'unknown',
        role: userRole,
        full_name: fullName,
        avatar_url: user?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName)}`,
        created_at: user?.created_at || new Date().toISOString(),
        email: user?.email,
      };

      return { success: true, data: fallbackProfile, error: null };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] AuthService.updateProfile', { userId, updates });
    const res = await apiClient.put<any>('/auth/me', updates);
    if (res.success && res.data) {
      const updatedProfile = res.data.profile || res.data;
      useAuthStore.getState().setProfile(updatedProfile);
      return { success: true, data: updatedProfile as Profile, error: null };
    }
    return {
      success: false,
      data: null,
      error: res.error || 'Gagal memperbarui profil pengguna.',
    };
  },
};
