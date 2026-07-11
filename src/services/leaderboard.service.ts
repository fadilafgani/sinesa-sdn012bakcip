import { supabase } from '../lib/supabase';
import { safeCall } from './base.service';
import type { ServiceResponse } from './base.service';
import type { Participant } from '../types';

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
