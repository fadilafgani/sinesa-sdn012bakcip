import { realtimeChannelManager } from './realtime-channel';
import { realtimeEvents } from './realtime-events';
import { logRealtime } from './realtime-utils';
import type { RealtimeStatus } from './realtime-types';
import { SessionService } from '../services/session.service';
import { ParticipantService } from '../services/participant.service';

export const RealtimeManager = {
  onStatusChange(callback: (status: RealtimeStatus) => void) {
    realtimeChannelManager.setStatusCallback(callback);
  },

  connectAsHost(sessionId: string) {
    // Only subscribe if not already subscribed to this session as host
    if (
      realtimeChannelManager.sessionId === sessionId &&
      realtimeChannelManager.role === 'host'
    ) {
      logRealtime('connectAsHost: Already connected to this session');
      return;
    }

    logRealtime(`Connecting as Host for session: ${sessionId}`);
    realtimeChannelManager.subscribe(sessionId, 'host');
    this.recoverSessionState(sessionId);
  },

  connectAsStudent(sessionId: string, participantId: string) {
    // Only subscribe if not already subscribed to this session as student
    if (
      realtimeChannelManager.sessionId === sessionId &&
      realtimeChannelManager.role === 'student' &&
      realtimeChannelManager.participantId === participantId
    ) {
      logRealtime('connectAsStudent: Already connected to this session');
      return;
    }

    logRealtime(`Connecting as Student for session: ${sessionId}, participant: ${participantId}`);
    realtimeChannelManager.subscribe(sessionId, 'student', participantId);
    this.recoverSessionState(sessionId, participantId);
  },

  disconnect() {
    logRealtime('Disconnecting realtime manager');
    realtimeChannelManager.unsubscribe();
  },

  async recoverSessionState(sessionId: string, participantId?: string) {
    logRealtime(`Recovering state for session: ${sessionId}`);
    try {
      // 1. Fetch latest quiz session
      const sessionRes = await SessionService.getSession(sessionId);
      if (sessionRes.success && sessionRes.data) {
        logRealtime('State recovery: session fetched successfully', sessionRes.data);
        realtimeEvents.emit('SessionUpdated', sessionRes.data);
      }

      // 2. Fetch latest participant info if participantId is provided
      if (participantId) {
        const partRes = await ParticipantService.getParticipantById(participantId);
        if (partRes.success && partRes.data) {
          logRealtime('State recovery: participant fetched successfully', partRes.data);
          realtimeEvents.emit('MyParticipantUpdated', partRes.data);
        }
      }
    } catch (err) {
      console.error('[REALTIME] State recovery failed:', err);
    }
  }
};

// Wire up state recovery automatically on reconnection success
realtimeChannelManager.setStatusCallback((status) => {
  if (status === 'CONNECTED') {
    logRealtime('Realtime Connected');
    const sessId = realtimeChannelManager.sessionId;
    const partId = realtimeChannelManager.participantId;
    if (sessId) {
      logRealtime('Realtime Reconnected');
      RealtimeManager.recoverSessionState(sessId, partId || undefined);
    }
  } else if (status === 'DISCONNECTED') {
    logRealtime('Realtime Disconnected');
  }
});
