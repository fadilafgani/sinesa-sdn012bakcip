import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Profile } from '@/types';

export const AuthService = {
  async signIn(email: string, password: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.signIn', { email });
    return safeCall(
      supabase.auth.signInWithPassword({
        email,
        password,
      })
    );
  },

  async signUp(email: string, password: string, role: string, fullName: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.signUp', { email, role, fullName });
    return safeCall(
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role,
            full_name: fullName,
          },
        },
      })
    );
  },

  async signOut(): Promise<ServiceResponse<void>> {
    console.log('[SYNC] AuthService.signOut');
    return safeCall(supabase.auth.signOut());
  },

  async getSession(): Promise<ServiceResponse<any>> {
    return safeCall(supabase.auth.getSession());
  },

  async refreshSession(): Promise<ServiceResponse<any>> {
    return safeCall(supabase.auth.getSession());
  },

  async resetPassword(email: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] AuthService.resetPassword', { email });
    return safeCall(
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    );
  },

  async getOrCreateProfile(user: any): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] AuthService.getOrCreateProfile', { userId: user.id });
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        return { success: false, data: null, error };
      }

      if (profile) {
        return { success: true, data: profile as Profile, error: null };
      }

      // Fallback fallback profile insertion
      const userRole = (user.user_metadata?.role || 'student');
      const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User Sinesa';

      const newProfile = {
        id: user.id,
        role: userRole,
        full_name: fullName,
        avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName)}`,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select('*')
        .single();

      if (insertError) {
        return {
          success: true,
          data: {
            ...newProfile,
            created_at: new Date().toISOString(),
          } as Profile,
          error: null,
        };
      }

      return { success: true, data: inserted as Profile, error: null };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] AuthService.updateProfile', { userId, updates });
    return safeCall(
      supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('*')
        .single()
    );
  }
};
