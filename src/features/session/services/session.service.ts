import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { QuizSession } from '@/types';

export const SessionService = {
  async getSession(id: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.getSession', { id });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  async getLatestActiveSession(quizId: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.getLatestActiveSession', { quizId });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .select('*')
        .eq('quiz_id', quizId)
        .in('status', ['lobby', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
  },

  async getActiveSessionsForQuiz(quizId: string, hostId: string): Promise<ServiceResponse<QuizSession[]>> {
    console.log('[SYNC] SessionService.getActiveSessionsForQuiz', { quizId, hostId });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .select('*')
        .eq('quiz_id', quizId)
        .eq('host_id', hostId)
        .in('status', ['lobby', 'active'])
        .order('created_at', { ascending: false })
    );
  },

  async createSession(session: Omit<QuizSession, 'id' | 'created_at' | 'completed_at'>): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.createSession', session);
    return safeCall(
      supabase
        .from('quiz_sessions')
        .insert(session)
        .select()
        .single()
    );
  },

  async updateSession(id: string, updates: Partial<QuizSession>): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.updateSession', { id, updates });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  },

  async finishSession(id: string): Promise<ServiceResponse<QuizSession>> {
    console.log('[SYNC] SessionService.finishSession', { id });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .update({
          status: 'completed',
          current_stage: 'finished',
          completed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    );
  },

  async terminateSessions(quizId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] SessionService.terminateSessions', { quizId });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('quiz_id', quizId)
        .in('status', ['lobby', 'active'])
    );
  },

  async terminateSessionsByIds(ids: string[]): Promise<ServiceResponse<void>> {
    console.log('[SYNC] SessionService.terminateSessionsByIds', { ids });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .in('id', ids)
    );
  },

  async getQuizSessionIds(quizId: string): Promise<ServiceResponse<{ id: string }[]>> {
    console.log('[SYNC] SessionService.getQuizSessionIds', { quizId });
    return safeCall(
      supabase
        .from('quiz_sessions')
        .select('id')
        .eq('quiz_id', quizId)
    );
  }
};
