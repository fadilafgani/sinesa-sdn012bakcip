import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Participant } from '@/types';

export const LeaderboardService = {
  /**
   * Fetch official leaderboard with server-side calculated scores and rankings.
   * Frontend must NEVER calculate primary scores.
   */
  async getLeaderboard(sessionId: string, limit: number = 50): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] LeaderboardService.getLeaderboard', { sessionId, limit });
    return safeCall<Participant[]>(
      apiClient.get<Participant[]>('/leaderboard', {
        params: {
          session_id: sessionId,
          limit
        }
      })
    );
  }
};
