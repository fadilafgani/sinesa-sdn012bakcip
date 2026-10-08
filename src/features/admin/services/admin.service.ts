import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Profile, ActivityLog } from '@/types';

export interface AdminStatsResponse {
  users: {
    total: number;
    teachers: number;
    students: number;
    admins: number;
    active: number;
    inactive: number;
  };
  quizzes: {
    total: number;
    active: number;
    inactive: number;
  };
  sessions: {
    total: number;
    lobby: number;
    active: number;
    completed: number;
  };
  gameplay: {
    total_participants: number;
    total_answers: number;
    correct_answers: number;
    average_score: number;
  };
  storage: {
    total_files: number;
    total_bytes: number;
  };
  recent_logs: ActivityLog[];
  recent_sessions: {
    id: string;
    quiz_id: string;
    quiz_title: string;
    host_name: string;
    status: string;
    current_stage: string;
    participant_count: number;
    created_at: string;
    completed_at: string | null;
  }[];
  server: {
    php_version: string;
    server_time: string;
  };
}

export interface CreateUserData {
  full_name: string;
  email: string;
  password: string;
  username?: string;
  role: 'admin' | 'teacher' | 'student';
  status?: 'active' | 'inactive';
  avatar_url?: string;
}

export interface UpdateUserData {
  full_name?: string;
  fullName?: string;
  email?: string;
  username?: string;
  role?: 'admin' | 'teacher' | 'student';
  status?: 'active' | 'inactive';
  avatar_url?: string;
  avatarUrl?: string;
  password?: string;
}

export const AdminService = {
  /**
   * Get all users with optional filters
   */
  async getUsers(params?: { role?: string; status?: string; search?: string }): Promise<ServiceResponse<Profile[]>> {
    return safeCall<Profile[]>(
      apiClient.get<Profile[]>('/admin/users', { params })
    );
  },

  /**
   * Get single user profile by ID
   */
  async getUserById(id: string): Promise<ServiceResponse<Profile>> {
    return safeCall<Profile>(
      apiClient.get<Profile>('/admin/users', { params: { id } })
    );
  },

  /**
   * Create a new user (admin, teacher, or student)
   */
  async createUser(data: CreateUserData): Promise<ServiceResponse<Profile>> {
    return safeCall<Profile>(
      apiClient.post<Profile>('/admin/users', data)
    );
  },

  /**
   * Update existing user details, role, status, or password
   */
  async updateUser(id: string, data: UpdateUserData): Promise<ServiceResponse<Profile>> {
    return safeCall<Profile>(
      apiClient.put<Profile>('/admin/users', data, { params: { id } })
    );
  },

  /**
   * Delete user account permanently
   */
  async deleteUser(id: string): Promise<ServiceResponse<{ deleted_id: string; message: string }>> {
    return safeCall<{ deleted_id: string; message: string }>(
      apiClient.delete<{ deleted_id: string; message: string }>('/admin/users', { params: { id } })
    );
  },

  /**
   * Get comprehensive dashboard statistics & telemetry
   */
  async getStats(): Promise<ServiceResponse<AdminStatsResponse>> {
    return safeCall<AdminStatsResponse>(
      apiClient.get<AdminStatsResponse>('/admin/stats')
    );
  },

  /**
   * Get system and school settings
   */
  async getSettings(): Promise<ServiceResponse<Record<string, string>>> {
    return safeCall<Record<string, string>>(
      apiClient.get<Record<string, string>>('/settings')
    );
  },

  /**
   * Update system and school settings
   */
  async updateSettings(settings: Record<string, string>): Promise<ServiceResponse<Record<string, string>>> {
    return safeCall<Record<string, string>>(
      apiClient.put<Record<string, string>>('/settings', settings)
    );
  }
};
