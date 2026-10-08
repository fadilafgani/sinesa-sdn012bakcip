import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';

export interface SystemSettingItem {
  key: string;
  value: string;
}

export const SettingsService = {
  /**
   * Get all system and school settings from PHP REST API
   */
  async getSystemSettings(): Promise<ServiceResponse<SystemSettingItem[]>> {
    const res = await safeCall<Record<string, string>>(
      apiClient.get<Record<string, string>>('/settings')
    );

    if (!res.success || !res.data) {
      return { success: res.success, data: null, error: res.error };
    }

    const items: SystemSettingItem[] = Object.entries(res.data).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    return { success: true, data: items, error: null };
  },

  /**
   * Upsert system settings via PHP REST API (admin only)
   */
  async upsertSystemSettings(settings: SystemSettingItem[]): Promise<ServiceResponse<Record<string, string>>> {
    const payload: Record<string, string> = {};
    settings.forEach(item => {
      payload[item.key] = item.value;
    });

    return safeCall<Record<string, string>>(
      apiClient.put<Record<string, string>>('/settings', payload)
    );
  }
};
