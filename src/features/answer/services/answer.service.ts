import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Answer } from '@/types';

export const AnswerService = {
  async getAnswersForSession(sessionId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersForSession', { sessionId });
    return safeCall(
      supabase
        .from('answers')
        .select('*, participants!inner(session_id)')
        .eq('participants.session_id', sessionId)
    );
  },

  async getAnswersForQuestion(sessionId: string, questionId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersForQuestion', { sessionId, questionId });
    return safeCall(
      supabase
        .from('answers')
        .select('*, participants!inner(session_id)')
        .eq('participants.session_id', sessionId)
        .eq('question_id', questionId)
    );
  },

  async submitAnswer(answer: Omit<Answer, 'id' | 'answered_at'>): Promise<ServiceResponse<Answer>> {
    console.log('[SYNC] AnswerService.submitAnswer', answer);
    return safeCall(
      supabase
        .from('answers')
        .insert(answer)
        .select()
        .single()
    );
  },

  async getParticipantAnswers(participantId: string): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getParticipantAnswers', { participantId });
    return safeCall(
      supabase
        .from('answers')
        .select('*')
        .eq('participant_id', participantId)
    );
  },

  async getAnswersByParticipantIds(participantIds: string[]): Promise<ServiceResponse<Answer[]>> {
    console.log('[SYNC] AnswerService.getAnswersByParticipantIds', { count: participantIds.length });
    return safeCall(
      supabase
        .from('answers')
        .select('*')
        .in('participant_id', participantIds)
    );
  }
};
