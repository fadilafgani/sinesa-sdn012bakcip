import { create } from 'zustand';
import { AuthService } from '../services/auth.service';
import { apiClient } from '@/core/api-client';
import type { Profile, UserRole } from '@/types';
import { AnalyticsService } from '@/shared/services/analytics.service';

interface AuthState {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  isMock: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  setUserAndProfile: (user: any | null, profile: Profile | null) => void;
  // Mock mode auth helper
  loginMock: (email: string, role: UserRole, fullName: string) => void;
}

// Check if we are running in mock mode
export const checkIsMock = () => {
  if (import.meta.env.VITE_USE_MOCK === 'true') return true;
  if (import.meta.env.VITE_USE_MOCK === 'false') return false;
  return false;
};

// Preset mock profiles
const MOCK_PROFILES: Record<string, Omit<Profile, 'id' | 'created_at'>> = {
  'admin@sinesa.com': { role: 'admin', full_name: 'Administrator Sinesa', avatar_url: null },
  'guru@sinesa.com': { role: 'teacher', full_name: 'Ibu Guru Pertiwi', avatar_url: null },
  'murid@sinesa.com': { role: 'student', full_name: 'Budi Santoso', avatar_url: null },
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  isMock: checkIsMock(),

  initialize: async () => {
    set({ loading: true });
    const isMock = checkIsMock();

    if (isMock) {
      // Mock mode initialization
      const savedMockUser = localStorage.getItem('sinesa_mock_user');
      const savedMockProfile = localStorage.getItem('sinesa_mock_profile');
      if (savedMockUser && savedMockProfile) {
        set({
          user: JSON.parse(savedMockUser),
          profile: JSON.parse(savedMockProfile),
          isMock: true,
          loading: false,
        });
      } else {
        set({ user: null, profile: null, isMock: true, loading: false });
      }
      return;
    }

    // Register session expiration callback
    apiClient.onSessionExpired(() => {
      console.warn('[AUTH] Active session expired, clearing store state');
      set({ user: null, profile: null });
      AnalyticsService.trackEvent('logout');
    });

    try {
      // Session recovery via PHP JWT & HttpOnly refresh token cookie
      const sessionRes = await AuthService.getSession();

      if (sessionRes.success && sessionRes.data?.user) {
        const { user, profile } = sessionRes.data;
        set({
          user,
          profile: profile || null,
          isMock: false,
          loading: false,
        });
      } else {
        set({ user: null, profile: null, isMock: false, loading: false });
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ user: null, profile: null, isMock: false, loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true });
    AnalyticsService.trackEvent('logout');
    if (get().isMock) {
      localStorage.removeItem('sinesa_mock_user');
      localStorage.removeItem('sinesa_mock_profile');
      set({ user: null, profile: null, loading: false });
      return;
    }

    try {
      await AuthService.signOut();
    } catch (err) {
      console.warn('Error during signout:', err);
    } finally {
      set({ user: null, profile: null, loading: false });
    }
  },

  setProfile: (profile) => set({ profile }),

  setUserAndProfile: (user, profile) => set({ user, profile }),

  loginMock: (email, role, fullName) => {
    const mockUser = { id: `mock-uuid-${role}`, email };
    const mockProfile: Profile = {
      id: mockUser.id,
      role,
      full_name: fullName || MOCK_PROFILES[email]?.full_name || 'User Sinesa',
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName)}`,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem('sinesa_mock_user', JSON.stringify(mockUser));
    localStorage.setItem('sinesa_mock_profile', JSON.stringify(mockProfile));

    set({
      user: mockUser,
      profile: mockProfile,
      isMock: true,
      loading: false,
    });
    AnalyticsService.trackEvent('login', { email, role, isMock: true });
  },
}));
