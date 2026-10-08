import { apiClient } from '@/core/api-client';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Participant } from '@/types';

export const ParticipantService = {
  async getParticipantById(id: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantById', { id });
    return safeCall<Participant>(
      apiClient.get<Participant>('/participants', { params: { id } })
    );
  },

  async getParticipants(sessionId: string): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] ParticipantService.getParticipants', { sessionId });
    return safeCall<Participant[]>(
      apiClient.get<Participant[]>('/participants', { params: { session_id: sessionId } })
    );
  },

  async getParticipantBySessionAndUser(sessionId: string, studentId: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantBySessionAndUser', { sessionId, studentId });
    return safeCall<Participant>(
      apiClient.get<Participant>('/participants', { params: { session_id: sessionId, student_id: studentId } })
    );
  },

  async getParticipantBySessionAndName(sessionId: string, displayName: string): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.getParticipantBySessionAndName', { sessionId, displayName });
    return safeCall<Participant>(
      apiClient.get<Participant>('/participants', { params: { session_id: sessionId, display_name: displayName } })
    );
  },

  async joinParticipant(participant: Omit<Participant, 'id' | 'joined_at'>): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.joinParticipant', participant);
    return safeCall<Participant>(
      apiClient.post<Participant>('/participants', participant)
    );
  },

  async updateParticipant(id: string, updates: Partial<Participant>): Promise<ServiceResponse<Participant>> {
    console.log('[SYNC] ParticipantService.updateParticipant', { id, updates });
    return safeCall<Participant>(
      apiClient.put<Participant>('/participants', updates, { params: { id } })
    );
  },

  async getParticipantWithQuizDetails(id: string): Promise<ServiceResponse<any>> {
    console.log('[SYNC] ParticipantService.getParticipantWithQuizDetails', { id });
    return safeCall<any>(
      apiClient.get<any>('/participants', { params: { id, details: 'quiz' } })
    );
  },

  async removeParticipant(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] ParticipantService.removeParticipant', { id });
    return safeCall<void>(
      apiClient.delete<void>('/participants', { params: { id } })
    );
  },

  async getStudentHistory(studentId: string): Promise<ServiceResponse<any[]>> {
    console.log('[SYNC] ParticipantService.getStudentHistory', { studentId });
    return safeCall<any[]>(
      apiClient.get<any[]>('/participants', { params: { student_id: studentId, action: 'history' } })
    );
  },

  async getParticipantsBySessionIds(sessionIds: string[]): Promise<ServiceResponse<Participant[]>> {
    console.log('[SYNC] ParticipantService.getParticipantsBySessionIds', { count: sessionIds.length });
    return safeCall<Participant[]>(
      apiClient.get<Participant[]>('/participants', { params: { session_ids: sessionIds.join(',') } })
    );
  }
};
