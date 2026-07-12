import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Participant } from '@/types';

export const ParticipantService = {
  async getParticipantById(id: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantById', { id });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  async getParticipants(sessionId: string): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] ParticipantService.getParticipants', { sessionId });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
    );
  },

  async getParticipantBySessionAndUser(sessionId: string, studentId: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantBySessionAndUser', { sessionId, studentId });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .maybeSingle()
    );
  },

  async getParticipantBySessionAndName(sessionId: string, displayName: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantBySessionAndName', { sessionId, displayName });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('display_name', displayName)
        .maybeSingle()
    );
  },

  async joinParticipant(participant: Omit<Participant, 'id' | 'joined_at'>): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.joinParticipant', participant);
    return safeCall(
      supabase
        .from('participants')
        .insert(participant)
        .select()
        .single()
    );
  },

  async updateParticipant(id: string, updates: Partial<Participant>): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.updateParticipant', { id, updates });
    return safeCall(
      supabase
        .from('participants')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  },

  async getParticipantWithQuizDetails(id: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] ParticipantService.getParticipantWithQuizDetails', { id });
    return safeCall(
      supabase
        .from('participants')
        .select(`
          *,
          quiz_sessions (
            *,
            quizzes (
              *
            )
          )
        `)
        .eq('id', id)
        .single()
    );
  },

  async removeParticipant(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] ParticipantService.removeParticipant', { id });
    return safeCall(
      supabase
        .from('participants')
        .delete()
        .eq('id', id)
    );
  },

  async getStudentHistory(studentId: string): Promise<ServiceResponse<any[]>> {
    console.log('[SYNC] ParticipantService.getStudentHistory', { studentId });
    return safeCall(
      supabase
        .from('participants')
        .select(`
          id,
          score,
          joined_at,
          quiz_sessions!inner(
            id,
            completed_at,
            show_final_result,
            show_answer_review,
            quizzes!inner(
              id,
              title
            )
          ),
          answers(
            id,
            is_correct
          )
        `)
        .eq('student_id', studentId)
        .order('joined_at', { ascending: false })
    );
  },

  async getParticipantsBySessionIds(sessionIds: string[]): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] ParticipantService.getParticipantsBySessionIds', { count: sessionIds.length });
    return safeCall(
      supabase
        .from('participants')
        .select('*')
        .in('session_id', sessionIds)
    );
  }
};
