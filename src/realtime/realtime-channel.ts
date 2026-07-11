import { supabase } from '../lib/supabase';
import { logRealtime } from './realtime-utils';
import { realtimeEvents } from './realtime-events';
import type { RealtimeStatus } from './realtime-types';
import type { Participant } from '../types';

export class RealtimeChannelManager {
  private channel: any = null;
  private statusCallback: ((status: RealtimeStatus) => void) | null = null;
  private isReconnecting = false;
  
  // Publicly exposed fields for manager to trace connection context
  public sessionId: string | null = null;
  public participantId: string | null = null;
  public role: 'host' | 'student' | null = null;
  
  private heartbeatInterval: any = null;

  constructor() {}

  setStatusCallback(cb: (status: RealtimeStatus) => void) {
    this.statusCallback = cb;
  }

  private setStatus(status: RealtimeStatus) {
    logRealtime(`Status Changed: ${status}`);
    if (this.statusCallback) {
      this.statusCallback(status);
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
        logRealtime('Session Updated event', payload.new);
        realtimeEvents.emit('SessionUpdated', payload.new);

        const oldStage = payload.old ? (payload.old as any).current_stage : null;
        const newStage = (payload.new as any).current_stage;
        if (oldStage !== newStage) {
          realtimeEvents.emit('StageChanged', newStage);
        }

        const oldIdx = payload.old ? (payload.old as any).current_question_index : null;
        const newIdx = (payload.new as any).current_question_index;
        if (oldIdx !== newIdx) {
          realtimeEvents.emit('QuestionChanged', newIdx);
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
        const part = payload.new as Participant;
        if (!part || part.session_id !== sessionId) return;

        if (payload.eventType === 'INSERT') {
          logRealtime('Participant Joined event', part);
          realtimeEvents.emit('ParticipantJoined', part);
        } else if (payload.eventType === 'UPDATE') {
          logRealtime('Participant Updated event', part);
          realtimeEvents.emit('ParticipantUpdated', part);
          
          if (part.id === this.participantId) {
            realtimeEvents.emit('MyParticipantUpdated', part);
          }
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
    setTimeout(() => {
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
