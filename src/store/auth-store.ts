import { create } from 'zustand';
import { supabase } from '../lib/supabase';
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

// Helper to get or dynamically create profile if missing (resilient to trigger failures)
const getOrCreateProfile = async (user: any): Promise<Profile | null> => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      return profile as Profile;
    }

    // If profile is missing (e.g. trigger failed during signup)
    if (!profile) {
      const userRole = (user.user_metadata?.role || 'student') as UserRole;
      const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User Sinesa';

      const newProfile: Omit<Profile, 'created_at'> = {
        id: user.id,
        role: userRole,
        full_name: fullName,
        avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName)}`,
      };

      const { data: insertedProfile, error: insertError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select('*')
        .single();

      if (insertError) {
        console.warn('Failed to create database fallback profile, using in-memory profile:', insertError);
        return {
          ...newProfile,
          created_at: new Date().toISOString(),
        } as Profile;
      }

      return insertedProfile as Profile;
    }

    return null;
  } catch (err) {
    console.error('Error in getOrCreateProfile:', err);
    return null;
  }
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
      // Supabase initialization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const profile = await getOrCreateProfile(session.user);

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
          const profile = await getOrCreateProfile(session.user);

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
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error during Supabase signout:', err);
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
