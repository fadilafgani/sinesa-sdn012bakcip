import { logRealtime } from './realtime-utils';
import { realtimeEvents } from './realtime-events';
import type { RealtimeStatus } from './realtime-types';
import { apiClient } from '@/core/api-client';

/**
 * SINESA RealtimeChannelManager
 * High-performance Server-Sent Events (SSE) native client.
 * Features:
 * - Native EventSource connection
 * - Authorization token & credential transmission
 * - Session ID validation
 * - Stale event & duplicate event filtering
 * - Heartbeat watchdog & automatic exponential-backoff reconnect
 * - Leak-free disconnect cleanup
 */
export class RealtimeChannelManager {
  private eventSource: EventSource | null = null;
  private statusCallbacks: ((status: RealtimeStatus) => void)[] = [];
  private legacyStatusCallback: ((status: RealtimeStatus) => void) | null = null;

  // Active connection metadata
  public sessionId: string | null = null;
  public participantId: string | null = null;
  public role: 'host' | 'student' | null = null;

  // State management & watchdog timers
  private reconnectTimeout: any = null;
  private heartbeatWatchdog: any = null;
  private reconnectAttempts = 0;
  private isExplicitDisconnect = false;

  // Bounded LRU cache for deduplication and race-condition prevention
  private processedEventIds = new Set<string>();
  private lastEventTimestamps = new Map<string, number>();

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

  /**
   * Subscribe to a live quiz session using native SSE
   */
  subscribe(sessionId: string, role: 'host' | 'student', participantId?: string) {
    if (!sessionId || typeof sessionId !== 'string') {
      console.error('[REALTIME] Invalid session ID provided to subscribe');
      this.setStatus('ERROR');
      return;
    }

    // Prevent duplicate connections if already connected to same session & role
    if (
      this.eventSource &&
      this.eventSource.readyState === EventSource.OPEN &&
      this.sessionId === sessionId &&
      this.role === role &&
      this.participantId === (participantId || null)
    ) {
      logRealtime('Already connected to this session');
      return;
    }

    this.cleanup();

    this.sessionId = sessionId;
    this.role = role;
    this.participantId = participantId || null;
    this.isExplicitDisconnect = false;
    this.reconnectAttempts = 0;

    this.connect();
  }

  /**
   * Internal connection constructor
   */
  private connect() {
    if (this.isExplicitDisconnect || !this.sessionId) return;

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    // Build query params including auth token & participant info
    const params = new URLSearchParams();
    params.append('session_id', this.sessionId);
    params.append('role', this.role || 'student');
    if (this.participantId) {
      params.append('participant_id', this.participantId);
    }

    const token = apiClient.getAccessToken();
    if (token) {
      params.append('token', token);
    }

    const url = `/api/realtime/stream?${params.toString()}`;
    logRealtime(`Opening native EventSource: ${url}`);

    try {
      this.eventSource = new EventSource(url, { withCredentials: true });

      this.eventSource.onopen = () => {
        logRealtime('EventSource connection established');
        this.setStatus('CONNECTED');
        this.reconnectAttempts = 0;
        this.resetHeartbeatWatchdog();
      };

      this.eventSource.onerror = (err) => {
        if (this.isExplicitDisconnect) return;
        logRealtime('EventSource encountered error or cycle refresh:', err);
        
        // Native EventSource auto-reconnects, but if in CLOSED state, schedule manual reconnect
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleReconnect();
        } else {
          this.setStatus('RECONNECTING');
        }
      };

      // 1. StageChanged listener
      this.eventSource.addEventListener('StageChanged', (e: MessageEvent) => {
        this.handleEvent('StageChanged', e);
      });

      // 2. TimerTick listener
      this.eventSource.addEventListener('TimerTick', (e: MessageEvent) => {
        this.handleEvent('TimerTick', e);
      });

      // 3. ParticipantJoined listener
      this.eventSource.addEventListener('ParticipantJoined', (e: MessageEvent) => {
        this.handleEvent('ParticipantJoined', e);
      });

      // 4. AnswerSubmitted listener
      this.eventSource.addEventListener('AnswerSubmitted', (e: MessageEvent) => {
        this.handleEvent('AnswerSubmitted', e);
      });

      // 5. LeaderboardUpdated listener
      this.eventSource.addEventListener('LeaderboardUpdated', (e: MessageEvent) => {
        this.handleEvent('LeaderboardUpdated', e);
      });

      // 6. Heartbeat listener
      this.eventSource.addEventListener('heartbeat', (e: MessageEvent) => {
        this.resetHeartbeatWatchdog();
        try {
          const payload = JSON.parse(e.data);
          if (payload.action === 'cycle_refresh') {
            logRealtime('Server cycle refresh signal received');
          }
        } catch (_) {}
      });

      // 7. Error event from server
      this.eventSource.addEventListener('error', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          logRealtime('Server sent error event:', payload);
        } catch (_) {}
      });

    } catch (err) {
      console.error('[REALTIME] Failed to construct EventSource:', err);
      this.handleReconnect();
    }
  }

  /**
   * Safe parsing and deduplication filter for incoming SSE events
   */
  private handleEvent(eventType: string, e: MessageEvent) {
    this.resetHeartbeatWatchdog();

    let data: any;
    try {
      data = JSON.parse(e.data);
    } catch (parseErr) {
      console.error('[REALTIME] Failed to parse SSE event data:', parseErr);
      return;
    }

    const eventId = e.lastEventId || data.event_id || null;
    const timestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();

    // 1. Duplicate event protection (check bounded set)
    if (eventId) {
      if (this.processedEventIds.has(eventId)) {
        logRealtime(`Duplicate event ignored: ${eventId} (${eventType})`);
        return;
      }
      // Cap set size at 200 items to avoid memory leaks
      if (this.processedEventIds.size >= 200) {
        const first = this.processedEventIds.values().next().value;
        if (first) this.processedEventIds.delete(first);
      }
      this.processedEventIds.add(eventId);
    }

    // 2. Stale event protection (monotonic timestamp per event type)
    const lastTs = this.lastEventTimestamps.get(eventType) || 0;
    if (timestamp < lastTs) {
      logRealtime(`Stale event ignored: ${eventType} (ts: ${timestamp} < ${lastTs})`);
      return;
    }
    this.lastEventTimestamps.set(eventType, timestamp);

    console.log('REALTIME_EVENT', eventType, data);
    console.log('EVENT_RECEIVED', eventType, data);
    logRealtime(`Dispatched Event: ${eventType}`, data);

    // 3. Dispatch to internal Realtime EventEmitter
    switch (eventType) {
      case 'StageChanged': {
        const stage = data.stage;
        const session = data.session;
        if (stage) {
          realtimeEvents.emit('StageChanged', stage);
          if (stage === 'finished') {
            realtimeEvents.emit('QuizFinished', session || { current_stage: 'finished' });
          }
        }
        if (session) {
          realtimeEvents.emit('SessionUpdated', session);
          if (typeof session.current_question_index === 'number') {
            realtimeEvents.emit('QuestionChanged', session.current_question_index);
          }
          if (session.question_started_at || session.question_expires_at) {
            realtimeEvents.emit('TimerUpdated', {
              started_at: session.question_started_at,
              expires_at: session.question_expires_at
            });
          }
        }
        break;
      }

      case 'TimerTick': {
        realtimeEvents.emit('TimerTick', data);
        if (data.question_started_at || data.question_expires_at) {
          realtimeEvents.emit('TimerUpdated', {
            started_at: data.question_started_at,
            expires_at: data.question_expires_at
          });
        }
        break;
      }

      case 'ParticipantJoined': {
        if (data.participant) {
          realtimeEvents.emit('ParticipantJoined', data.participant);
        }
        break;
      }

      case 'AnswerSubmitted': {
        realtimeEvents.emit('AnswerSubmitted', data.answer || data);
        break;
      }

      case 'LeaderboardUpdated': {
        if (data.leaderboard) {
          realtimeEvents.emit('LeaderboardUpdated', data.leaderboard);
        }
        break;
      }
    }
  }

  /**
   * Watchdog timer to detect dead connection when no event/heartbeat is received
   */
  private resetHeartbeatWatchdog() {
    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog);
    }

    // If server does not send heartbeat or event within 35s, trigger reconnect
    this.heartbeatWatchdog = setTimeout(() => {
      if (this.isExplicitDisconnect) return;
      logRealtime('Heartbeat watchdog timed out (35s). Forcing reconnect...');
      this.handleReconnect();
    }, 35000);
  }

  /**
   * Reconnect with exponential backoff
   */
  private handleReconnect() {
    if (this.isExplicitDisconnect || !this.sessionId) return;

    this.setStatus('RECONNECTING');

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Backoff delay: 1s, 2s, 4s, capped at 8s
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    logRealtime(`Scheduling reconnect attempt #${this.reconnectAttempts} in ${delay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.isExplicitDisconnect && this.sessionId) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Unsubscribe and perform complete cleanup to prevent memory leaks
   */
  unsubscribe() {
    this.isExplicitDisconnect = true;
    this.cleanup();

    this.sessionId = null;
    this.role = null;
    this.participantId = null;

    logRealtime('Realtime channel completely unsubscribed');
    this.setStatus('DISCONNECTED');
  }

  /**
   * Internal resource cleanup
   */
  private cleanup() {
    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog);
      this.heartbeatWatchdog = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }

    this.processedEventIds.clear();
    this.lastEventTimestamps.clear();
  }
}

export const realtimeChannelManager = new RealtimeChannelManager();
