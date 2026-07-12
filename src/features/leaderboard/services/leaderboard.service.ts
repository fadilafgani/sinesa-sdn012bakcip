import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Participant } from '@/types';

export const LeaderboardService = {
  async getLeaderboard(sessionId: string): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] LeaderboardService.getLeaderboard', { sessionId });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .order('score', { ascending: false })
    );
  }
};
