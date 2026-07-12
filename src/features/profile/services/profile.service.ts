import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Profile } from '@/types';

export const ProfileService = {
  async getProfile(id: string): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.getProfile', { id });
    return safeCall(
      supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  async getAllProfiles(): Promise<ServiceResponse<Profile[]>> {
    console.log('[SYNC] ProfileService.getAllProfiles');
    return safeCall(
      supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
    );
  },

  async createProfile(profile: Omit<Profile, 'created_at'>): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.createProfile', profile);
    return safeCall(
      supabase
        .from('profiles')
        .insert(profile)
        .select()
        .single()
    );
  },

  async updateProfile(id: string, updates: Partial<Profile>): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.updateProfile', { id, updates });
    return safeCall(
      supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  },

  async deleteProfile(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] ProfileService.deleteProfile', { id });
    return safeCall(
      supabase
        .from('profiles')
        .delete()
        .eq('id', id)
    );
  }
};
