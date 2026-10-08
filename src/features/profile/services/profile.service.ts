import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Profile } from '@/types';

export const ProfileService = {
  /**
   * Get profile by ID or current authenticated user profile
   */
  async getProfile(id?: string): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.getProfile', { id });
    return safeCall<Profile>(
      apiClient.get<Profile>('/profile', {
        params: id ? { id } : {}
      })
    );
  },

  /**
   * Get all user profiles (Teacher or Admin only)
   */
  async getAllProfiles(params?: { role?: string; search?: string }): Promise<ServiceResponse<Profile[]>> {
    console.log('[SYNC] ProfileService.getAllProfiles', params);
    return safeCall<Profile[]>(
      apiClient.get<Profile[]>('/profile', {
        params: { all: 'true', ...params }
      })
    );
  },

  /**
   * Create new user profile (Admin only)
   */
  async createProfile(profile: Omit<Profile, 'created_at'> & { password?: string }): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.createProfile', profile);
    return safeCall<Profile>(
      apiClient.post<Profile>('/profile', profile)
    );
  },

  /**
   * Update profile by ID or current user profile
   */
  async updateProfile(id: string, updates: Partial<Profile> & { password?: string }): Promise<ServiceResponse<Profile>> {
    console.log('[SYNC] ProfileService.updateProfile', { id, updates });
    return safeCall<Profile>(
      apiClient.put<Profile>('/profile', updates, {
        params: { id }
      })
    );
  },

  /**
   * Delete user profile (Admin only)
   */
  async deleteProfile(id: string): Promise<ServiceResponse<{ deleted_id: string }>> {
    console.log('[SYNC] ProfileService.deleteProfile', { id });
    return safeCall<{ deleted_id: string }>(
      apiClient.delete<{ deleted_id: string }>('/profile', {
        params: { id }
      })
    );
  }
};
