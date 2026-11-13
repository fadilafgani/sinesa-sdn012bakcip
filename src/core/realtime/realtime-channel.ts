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
  public status: RealtimeStatus = 'DISCONNECTED';

  // State management & watchdog timers
  private reconnectTimeout: any = null;
  private heartbeatWatchdog: any = null;
  private reconnectedTimer: any = null;
  private sseDisconnectedSince: number = 0;
  private reconnectAttempts = 0;
  private isExplicitDisconnect = false;
  private lastEventId: string | null = null;
  private highestQuestionIndex: number = -1;

  // Bounded LRU cache for deduplication and race-condition prevention
  private processedEventIds = new Set<string>();
  private lastEventTimestamps = new Map<string, number>();

  // Adaptive Polling Fallback for hosting / proxy reliability
  private pollingInterval: any = null;
  private lastPolledStage: string | null = null;
  private lastPolledQuestionIdx: number | null = null;
  private lastPolledStatus: string | null = null;
  private lastPolledParticipantsCount: number = -1;
  private lastPolledAnswersCount: number = -1;
  private lastEventReceivedAt: number = 0;
  private isCycleRefresh: boolean = false;
  private isPollingActive: boolean = false;

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
    this.status = status;
    console.log('SUBSCRIPTION_STATUS', { role: this.role, sessionId: this.sessionId, status });
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
    this.highestQuestionIndex = -1;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.connect();
  }

  /**
   * Internal connection constructor
   */
  private connect() {
    if (this.isExplicitDisconnect || !this.sessionId) return;

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    // Build query params including auth token, participant info, and Last-Event-ID
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

    if (this.lastEventId) {
      params.append('last_event_id', this.lastEventId);
    }

    // Connect directly to stream.php to bypass potential rewrite conflicts
    const url = `/api/realtime/stream.php?${params.toString()}`;
    logRealtime(`Opening native EventSource: ${url}`);

    // Ensure background hybrid watchdog is running to guarantee 100% sync
    this.startAdaptivePolling();

    try {
      this.eventSource = new EventSource(url, { withCredentials: true });

      this.eventSource.onopen = () => {
        logRealtime('EventSource connection established');
        const wasReconnecting =
          this.reconnectAttempts > 0 ||
          this.status === 'RECONNECTING' ||
          this.status === 'POLLING_FALLBACK' ||
          this.status === 'ERROR';

        this.reconnectAttempts = 0;
        this.sseDisconnectedSince = 0;
        this.lastEventReceivedAt = Date.now();
        this.resetHeartbeatWatchdog();

        if (wasReconnecting) {
          this.setStatus('RECONNECTED');
          // Immediately sync state to ensure UI is 100% matched with server
          this.resyncStateNow();
          // After 2.5s of "Terhubung kembali" confirmation, transition to CONNECTED (hiding toast)
          if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
          this.reconnectedTimer = setTimeout(() => {
            if (this.status === 'RECONNECTED') {
              this.setStatus('CONNECTED');
            }
          }, 2500);
        } else {
          this.setStatus('CONNECTED');
        }
      };

      this.eventSource.onerror = (err) => {
        if (this.isExplicitDisconnect) return;

        const wasCycleRefresh = this.isCycleRefresh;
        this.isCycleRefresh = false;

        // Close stale EventSource to prevent hanging socket accumulation
        if (this.eventSource) {
          try {
            this.eventSource.close();
          } catch (_) {}
          this.eventSource = null;
        }

        // Clean cycle refresh reconnection (zero-delay, silent reconnect)
        if (wasCycleRefresh) {
          logRealtime('Server cycle refresh: silent immediate reconnect');
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (!this.isExplicitDisconnect && this.sessionId) {
              this.connect();
            }
          }, 150);
          return;
        }

        console.error('REALTIME_ERROR', {
          role: this.role,
          sessionId: this.sessionId,
          type: 'EventSourceError',
        });
        logRealtime('EventSource encountered error or cycle refresh:', err);

        if (!this.sseDisconnectedSince) {
          this.sseDisconnectedSince = Date.now();
        }

        this.handleReconnect();
      };

      // 1. StageChanged listener
      this.eventSource.addEventListener('StageChanged', (e: MessageEvent) => {
        this.handleEvent('StageChanged', e);
      });

      // 2. TimerTick listener
      this.eventSource.addEventListener('TimerTick', (e: MessageEvent) => {
        this.handleEvent('TimerTick', e);
      });

      // 2b. CountdownTick listener
      this.eventSource.addEventListener('CountdownTick', (e: MessageEvent) => {
        this.handleEvent('CountdownTick', e);
      });

      // 3. ParticipantJoined listener
      this.eventSource.addEventListener('ParticipantJoined', (e: MessageEvent) => {
        this.handleEvent('ParticipantJoined', e);
      });

      // 3b. ParticipantLeft listener
      this.eventSource.addEventListener('ParticipantLeft', (e: MessageEvent) => {
        this.handleEvent('ParticipantLeft', e);
      });

      // 3c. ParticipantsSynced listener
      this.eventSource.addEventListener('ParticipantsSynced', (e: MessageEvent) => {
        this.handleEvent('ParticipantsSynced', e);
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
        this.lastEventReceivedAt = Date.now();
        try {
          const payload = JSON.parse(e.data);
          if (payload.action === 'cycle_refresh') {
            this.isCycleRefresh = true;
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
    this.lastEventReceivedAt = Date.now();

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
      this.lastEventId = eventId;
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

    // 2. Stale event protection (with 15s clock-skew tolerance between server and client)
    const lastTs = this.lastEventTimestamps.get(eventType) || 0;
    if (lastTs > 0 && timestamp < lastTs - 15000) {
      logRealtime(`Stale event ignored: ${eventType} (ts: ${timestamp} < ${lastTs})`);
      return;
    }
    this.lastEventTimestamps.set(eventType, Math.max(lastTs, timestamp));

    console.log('REALTIME_EVENT_RECEIVED', {
      eventType,
      sessionId: this.sessionId,
      stage: data.stage || data.session?.current_stage || null,
      questionIndex: data.current_question_index ?? data.session?.current_question_index ?? null,
      timestamp,
    });
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
          const qIdx = session.current_question_index;
          if (typeof qIdx === 'number') {
            if (qIdx >= this.highestQuestionIndex || stage === 'waiting') {
              this.highestQuestionIndex = Math.max(this.highestQuestionIndex, qIdx);
              realtimeEvents.emit('QuestionChanged', qIdx);
            } else {
              logRealtime(`Ignoring regressive question index in SSE: ${qIdx} < ${this.highestQuestionIndex}`);
            }
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

      case 'CountdownTick': {
        realtimeEvents.emit('CountdownTick', data);
        break;
      }

      case 'ParticipantJoined': {
        if (data.participant) {
          realtimeEvents.emit('ParticipantJoined', data.participant);
        }
        break;
      }

      case 'ParticipantLeft': {
        realtimeEvents.emit('ParticipantLeft', data.participant || data);
        break;
      }

      case 'ParticipantsSynced': {
        realtimeEvents.emit('ParticipantsSynced', data);
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

    if (this.status !== 'POLLING_FALLBACK' && this.status !== 'RECONNECTED') {
      this.setStatus('RECONNECTING');
    }

    // Ensure fallback polling is running while SSE is disconnected
    this.startAdaptivePolling();

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Backoff delay: 1.5s, 2.5s, 4s, capped at 6s
    const delay = Math.min(1500 * Math.pow(1.4, this.reconnectAttempts), 6000);
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
   * Immediately resync latest state from REST API (used on tab focus or post-reconnect)
   */
  public async resyncStateNow() {
    if (this.isExplicitDisconnect || !this.sessionId) return;
    try {
      const res = await apiClient.get<any>(`/sessions?id=${encodeURIComponent(this.sessionId)}`);
      if (res.success && res.data) {
        const session = res.data;
        realtimeEvents.emit('SessionUpdated', session);
        if (session.current_stage) {
          realtimeEvents.emit('StageChanged', session.current_stage);
        }
        if (typeof session.current_question_index === 'number') {
          if (session.current_question_index >= this.highestQuestionIndex || session.current_stage === 'waiting') {
            this.highestQuestionIndex = Math.max(this.highestQuestionIndex, session.current_question_index);
            realtimeEvents.emit('QuestionChanged', session.current_question_index);
          }
        }
      }
    } catch (_) {}
  }

  /**
   * Browser visibility change handler (tab background vs foreground resume)
   */
  private handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible' && this.sessionId && !this.isExplicitDisconnect) {
      logRealtime('Tab resumed active visibility, checking connection and resyncing state...');
      if (!this.eventSource || this.eventSource.readyState !== EventSource.OPEN) {
        this.handleReconnect();
      }
      this.resyncStateNow();
    }
  };

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
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.stopAdaptivePolling();

    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog);
      this.heartbeatWatchdog = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectedTimer) {
      clearTimeout(this.reconnectedTimer);
      this.reconnectedTimer = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }

    this.sseDisconnectedSince = 0;
    this.processedEventIds.clear();
    this.lastEventTimestamps.clear();
  }

  /**
   * Adaptive background watchdog & hybrid state sync.
   * Guarantees 100% real-time state sync even if SSE is buffered or proxy-blocked by hosting/network.
   */
  private startAdaptivePolling() {
    if (this.pollingInterval) return; // Prevent multiple interval timers accumulating

    const pollTick = async () => {
      if (this.isExplicitDisconnect || !this.sessionId) return;

      // Determine cadence: 2500ms if SSE is healthy and received data recently; 1500ms if offline or buffered
      const sseHealthy = this.eventSource?.readyState === EventSource.OPEN && (Date.now() - this.lastEventReceivedAt < 5000);
      const nextDelay = sseHealthy ? 2500 : 1500;

      if (!this.isPollingActive) {
        this.isPollingActive = true;

        try {
          const res = await apiClient.get<any>(`/sessions?id=${encodeURIComponent(this.sessionId)}`);
          if (res.success && res.data) {
            const session = res.data;

            // If SSE has been disconnected for > 3.5s and polling is successfully syncing data,
            // inform user via POLLING_FALLBACK status
            if (
              this.sseDisconnectedSince > 0 &&
              Date.now() - this.sseDisconnectedSince > 3500 &&
              (this.status === 'RECONNECTING' || this.status === 'ERROR' || this.status === 'CONNECTING')
            ) {
              this.setStatus('POLLING_FALLBACK');
            }

            const stageChanged = session.current_stage !== this.lastPolledStage;
            const qIdxChanged = session.current_question_index !== this.lastPolledQuestionIdx;
            const statusChanged = session.status !== this.lastPolledStatus;

            if (stageChanged || qIdxChanged || statusChanged) {
              this.lastPolledStage = session.current_stage;
              this.lastPolledQuestionIdx = session.current_question_index;
              this.lastPolledStatus = session.status;

              logRealtime(`[HYBRID_SYNC] Stage/Question state sync: ${session.current_stage} (qIdx: ${session.current_question_index})`);

              realtimeEvents.emit('SessionUpdated', session);
              if (session.current_stage) {
                realtimeEvents.emit('StageChanged', session.current_stage);
                if (session.current_stage === 'finished') {
                  realtimeEvents.emit('QuizFinished', session);
                }
              }
              if (typeof session.current_question_index === 'number') {
                if (session.current_question_index >= this.highestQuestionIndex || session.current_stage === 'waiting') {
                  this.highestQuestionIndex = Math.max(this.highestQuestionIndex, session.current_question_index);
                  realtimeEvents.emit('QuestionChanged', session.current_question_index);
                }
              }
              if (session.question_started_at || session.question_expires_at) {
                realtimeEvents.emit('TimerUpdated', {
                  started_at: session.question_started_at,
                  expires_at: session.question_expires_at,
                });
              }
            }

            // Sync participants in lobby and whenever participant_count changes for BOTH host and student
            const inLobby = session.current_stage === 'waiting' || session.status === 'lobby';
            const partCount = session.participant_count ?? -1;
            if (inLobby || (partCount >= 0 && partCount !== this.lastPolledParticipantsCount)) {
              if (partCount !== this.lastPolledParticipantsCount || inLobby) {
                const partRes = await apiClient.get<any[]>(`/participants?session_id=${encodeURIComponent(this.sessionId)}`);
                if (partRes.success && Array.isArray(partRes.data)) {
                  if (partRes.data.length !== this.lastPolledParticipantsCount) {
                    this.lastPolledParticipantsCount = partRes.data.length;
                    realtimeEvents.emit('ParticipantsSynced', {
                      session_id: this.sessionId,
                      participants: partRes.data,
                      count: partRes.data.length,
                    });
                    partRes.data.forEach(p => {
                      realtimeEvents.emit('ParticipantJoined', p);
                    });
                  }
                }
              }
            }

            // For host: sync answer submissions during gameplay
            if (this.role === 'host') {
              const ansCount = session.total_answers ?? -1;
              if (ansCount >= 0 && ansCount !== this.lastPolledAnswersCount) {
                this.lastPolledAnswersCount = ansCount;
                realtimeEvents.emit('AnswerSubmitted', { total_answers: ansCount });
              }

              // Sync leaderboard on podium / leaderboard stages
              if (session.current_stage === 'leaderboard' || session.current_stage === 'finished') {
                const lbRes = await apiClient.get<any[]>(`/participants?session_id=${encodeURIComponent(this.sessionId)}&leaderboard=1`);
                if (lbRes.success && Array.isArray(lbRes.data)) {
                  realtimeEvents.emit('LeaderboardUpdated', lbRes.data);
                }
              }
            }
          }
        } catch (_) {
          // Silently tolerate transient polling error
        } finally {
          this.isPollingActive = false;
        }
      }

      if (!this.isExplicitDisconnect && this.sessionId) {
        this.pollingInterval = setTimeout(pollTick, nextDelay);
      }
    };

    this.pollingInterval = setTimeout(pollTick, 1500);
  }

  private stopAdaptivePolling() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.lastPolledStage = null;
    this.lastPolledQuestionIdx = null;
    this.lastPolledStatus = null;
    this.lastPolledParticipantsCount = -1;
    this.lastPolledAnswersCount = -1;
    this.isPollingActive = false;
  }
}

export const realtimeChannelManager = new RealtimeChannelManager();
