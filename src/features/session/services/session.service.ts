import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { QuizSession } from '@/types';

export const SessionService = {
  async getSession(id: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.getSession', { id });
    return safeCall<QuizSession>(
      apiClient.get<QuizSession>('/sessions', { params: { id } })
    );
  },

  async getAllSessions(): Promise<ServiceResponse<QuizSession[]>> {
    console.log('[SYNC] SessionService.getAllSessions');
    return safeCall<QuizSession[]>(
      apiClient.get<QuizSession[]>('/sessions')
    );
  },

  async getLatestActiveSession(quizId: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.getLatestActiveSession', { quizId });
    return safeCall<QuizSession>(
      apiClient.get<QuizSession>('/sessions', { params: { quiz_id: quizId, latest_active: 1 } })
    );
  },

  async getActiveSessionsForQuiz(quizId: string, hostId: string): Promise<ServiceResponse<QuizSession[]>> {
    console.log('[SYNC] SessionService.getActiveSessionsForQuiz', { quizId, hostId });
    return safeCall<QuizSession[]>(
      apiClient.get<QuizSession[]>('/sessions', {
        params: { quiz_id: quizId, host_id: hostId, status: 'lobby,active' }
      })
    );
  },

  async createSession(session: Omit<QuizSession, 'id' | 'created_at' | 'completed_at'>): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.createSession', session);
    return safeCall<QuizSession>(
      apiClient.post<QuizSession>('/sessions', session)
    );
  },

  async updateSession(id: string, updates: Partial<QuizSession>): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.updateSession', { id, updates });
    return safeCall<QuizSession>(
      apiClient.put<QuizSession>('/sessions', updates, { params: { id } })
    );
  },

  async finishSession(id: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.finishSession', { id });
    return safeCall<QuizSession>(
      apiClient.put<QuizSession>('/sessions', {
        status: 'completed',
        current_stage: 'finished',
        completed_at: new Date().toISOString()
      }, { params: { id, action: 'finish' } })
    );
  },

  async terminateSessions(quizId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] SessionService.terminateSessions', { quizId });
    return safeCall<void>(
      apiClient.post<void>('/sessions', { action: 'terminate', quiz_id: quizId }, { params: { action: 'terminate' } })
    );
  },

  async terminateSessionsByIds(ids: string[]): Promise<ServiceResponse<void>> {
    console.log('[SYNC] SessionService.terminateSessionsByIds', { ids });
    return safeCall<void>(
      apiClient.post<void>('/sessions', { action: 'terminate_by_ids', ids }, { params: { action: 'terminate_by_ids' } })
    );
  },

  async getQuizSessionIds(quizId: string): Promise<ServiceResponse<{ id: string }[]>> {
    console.log('[SYNC] SessionService.getQuizSessionIds', { quizId });
    return safeCall<{ id: string }[]>(
      apiClient.get<{ id: string }[]>('/sessions', { params: { quiz_id: quizId, fields: 'id' } })
    );
  }
};
