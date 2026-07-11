import { supabase } from '../lib/supabase';
import { safeCall } from './base.service';
import type { ServiceResponse } from './base.service';

export const SettingsService = {
  async getSystemSettings(): Promise<ServiceResponse<any[]>> {
    console.log('[SYNC] SettingsService.getSystemSettings');
    return safeCall(
      supabase
        .from('system_settings')
        .select('*')
    );
  },

  async upsertSystemSettings(settings: { key: string; value: string }[]): Promise<ServiceResponse<any>> {
    console.log('[SYNC] SettingsService.upsertSystemSettings', settings);
    return safeCall(
      supabase
        .from('system_settings')
        .upsert(settings)
    );
  }
};
