import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Answer } from '@/types';

export const AnswerService = {
  async getAnswersForSession(sessionId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersForSession', { sessionId });
    return safeCall<Answer[]>(
      apiClient.get<Answer[]>('/answers', { params: { session_id: sessionId } })
    );
  },

  async getAnswersForQuestion(sessionId: string, questionId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersForQuestion', { sessionId, questionId });
    return safeCall<Answer[]>(
      apiClient.get<Answer[]>('/answers', { params: { session_id: sessionId, question_id: questionId } })
    );
  },

  async submitAnswer(answer: Omit<Answer, 'id' | 'answered_at'>): Promise<ServiceResponse<Answer>> {
    console.log('[SYNC] AnswerService.submitAnswer', answer);
    return safeCall<Answer>(
      apiClient.post<Answer>('/answers/submit', answer)
    );
  },

  async getParticipantAnswers(participantId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getParticipantAnswers', { participantId });
    return safeCall<Answer[]>(
      apiClient.get<Answer[]>('/answers', { params: { participant_id: participantId } })
    );
  },

  async getAnswersByParticipantIds(participantIds: string[]): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersByParticipantIds', { count: participantIds.length });
    return safeCall<Answer[]>(
      apiClient.get<Answer[]>('/answers', { params: { participant_ids: participantIds.join(',') } })
    );
  }
};
