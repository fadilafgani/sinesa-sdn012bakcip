import { supabase } from '@/core/supabase';
import { logRealtime } from './realtime-utils';
import { realtimeEvents } from './realtime-events';
import type { RealtimeStatus } from './realtime-types';
import type { Participant } from '@/types';

export class RealtimeChannelManager {
  private channel: any = null;
  private statusCallbacks: ((status: RealtimeStatus) => void)[] = [];
  private legacyStatusCallback: ((status: RealtimeStatus) => void) | null = null;
  private isReconnecting = false;
  
  // Publicly exposed fields for manager to trace connection context
  public sessionId: string | null = null;
  public participantId: string | null = null;
  public role: 'host' | 'student' | null = null;
  
  private heartbeatInterval: any = null;
  private reconnectTimeout: any = null;

  constructor() {}

  setStatusCallback(cb: (status: RealtimeStatus) => void) {
    this.legacyStatusCallback = cb;
  }

  addStatusCallback(cb: (status: RealtimeStatus) => void) {
    if (!this.statusCallbacks.includes(cb)) {
      this.statusCallbacks.push(cb);
    }
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb);
    };
  }

  private setStatus(status: RealtimeStatus) {
    logRealtime(`Status Changed: ${status}`);
    this.statusCallbacks.forEach(cb => {
      try { cb(status); } catch (e) { console.error('Error in status callback:', e); }
    });
    if (this.legacyStatusCallback) {
      try { this.legacyStatusCallback(status); } catch (e) { console.error('Error in legacy status callback:', e); }
    }
  }

  subscribe(sessionId: string, role: 'host' | 'student', participantId?: string) {
    if (this.channel) {
      this.unsubscribe();
    }

    this.sessionId = sessionId;
    this.role = role;
    this.participantId = participantId || null;
    this.isReconnecting = false;

    this.setStatus('CONNECTING');

    const channelName = `quiz-session-${sessionId}`;
    logRealtime(`Subscribing to channel: ${channelName} as ${role}`);

    let ch = supabase.channel(channelName);

    // 1. Session Updates Listener
    ch = ch.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'quiz_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        logRealtime('Realtime Event: Session Updated');
        logRealtime('Session Updated', payload.new);
        realtimeEvents.emit('SessionUpdated', payload.new);

        const oldStage = payload.old ? (payload.old as any).current_stage : null;
        const newStage = (payload.new as any).current_stage;
        if (oldStage !== newStage) {
          logRealtime('Stage Updated', newStage);
          realtimeEvents.emit('StageChanged', newStage);
        }

        const oldIdx = payload.old ? (payload.old as any).current_question_index : null;
        const newIdx = (payload.new as any).current_question_index;
        if (oldIdx !== newIdx) {
          logRealtime('Question Updated', newIdx);
          realtimeEvents.emit('QuestionChanged', newIdx);
        }

        const oldStart = payload.old ? (payload.old as any).question_started_at : null;
        const newStart = (payload.new as any).question_started_at;
        const oldExpire = payload.old ? (payload.old as any).question_expires_at : null;
        const newExpire = (payload.new as any).question_expires_at;
        if (oldStart !== newStart || oldExpire !== newExpire) {
          realtimeEvents.emit('TimerUpdated', { started_at: newStart, expires_at: newExpire });
        }

        if (newStage === 'finished') {
          realtimeEvents.emit('QuizFinished', payload.new);
        }
      }
    );

    // 2. Participant Updates Listener
    ch = ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'participants',
      },
      (payload) => {
        const part = (payload.new || payload.old) as Participant;
        if (!part || part.session_id !== sessionId) return;

        if (payload.eventType === 'INSERT') {
          logRealtime('Participant Joined event', part);
          realtimeEvents.emit('ParticipantJoined', part);
        } else if (payload.eventType === 'UPDATE') {
          logRealtime('Realtime Event: Participant Updated', part);
          realtimeEvents.emit('ParticipantUpdated', part);
          logRealtime('Leaderboard Updated', part);
          realtimeEvents.emit('LeaderboardUpdated', part);
          
          if (part.id === this.participantId) {
            realtimeEvents.emit('MyParticipantUpdated', part);
          }
        } else if (payload.eventType === 'DELETE') {
          logRealtime('Participant Left event', part);
          realtimeEvents.emit('ParticipantLeft', part);
        }
      }
    );

    // 3. Answers Listener (for host/teacher score calculation)
    if (role === 'host') {
      ch = ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
        },
        (payload) => {
          logRealtime('Answer Submitted event', payload.new);
          realtimeEvents.emit('AnswerSubmitted', payload.new);
        }
      );
    }

    this.channel = ch;

    this.channel.subscribe((status: string, err: any) => {
      logRealtime(`Subscription status callback: ${status}`, err || '');
      if (status === 'SUBSCRIBED') {
        this.setStatus('CONNECTED');
        this.isReconnecting = false;
        this.startHeartbeat();
      } else if (status === 'CLOSED') {
        this.setStatus('DISCONNECTED');
        this.stopHeartbeat();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.setStatus('ERROR');
        this.stopHeartbeat();
        this.handleReconnect();
      }
    });
  }

  unsubscribe() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isReconnecting = false;
    this.sessionId = null;
    this.role = null;
    this.participantId = null;

    if (this.channel) {
      logRealtime('Unsubscribing channel');
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.setStatus('DISCONNECTED');
  }

  private handleReconnect() {
    if (this.isReconnecting || !this.sessionId || !this.role) return;
    this.isReconnecting = true;
    this.setStatus('RECONNECTING');

    logRealtime('Attempting auto-reconnect in 3s...');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.isReconnecting && this.sessionId && this.role) {
        this.subscribe(this.sessionId, this.role, this.participantId || undefined);
      }
    }, 3000);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      // Check if channel websocket state is open/joined
      if (this.channel && this.channel.state === 'joined') {
        // Heartbeat healthy
      } else {
        logRealtime('Heartbeat failed: channel state unhealthy. Reconnecting...');
        this.handleReconnect();
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export const realtimeChannelManager = new RealtimeChannelManager();
