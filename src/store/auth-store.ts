import { create } from 'zustand';
import { AuthService } from '../services/auth.service';
import { supabase } from '../lib/supabase'; // Kept only for onAuthStateChange listener
import type { Profile, UserRole } from '../types';

interface AuthState {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  isMock: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  // Mock mode auth helper
  loginMock: (email: string, role: UserRole, fullName: string) => void;
}

// Check if we are running in mock mode due to unset environment variables
export const checkIsMock = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return !url || url.includes('your-project') || url.includes('placeholder');
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

    try {
      // Supabase initialization via AuthService
      const sessionRes = await AuthService.getSession();
      const session = sessionRes.data?.session;
      
      if (session?.user) {
        const profileRes = await AuthService.getOrCreateProfile(session.user);
        const profile = profileRes.success ? profileRes.data : null;

        set({
          user: session.user,
          profile,
          loading: false,
        });
      } else {
        set({ user: null, profile: null, loading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profileRes = await AuthService.getOrCreateProfile(session.user);
          const profile = profileRes.success ? profileRes.data : null;

          set({
            user: session.user,
            profile,
          });
        } else {
          set({ user: null, profile: null });
        }
      });

    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ user: null, profile: null, loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true });
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
  },
}));
