import { logRealtime } from './realtime-utils';
import type { RealtimeEvent } from './realtime-types';

type RealtimeCallback = (data: any) => void;

class RealtimeEventEmitter {
  private listeners: Record<string, RealtimeCallback[]> = {};

  on(event: RealtimeEvent, callback: RealtimeCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event: RealtimeEvent, callback: RealtimeCallback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: RealtimeEvent, data: any) {
    logRealtime(`Event Emitted: ${event}`, data);
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[REALTIME] Error in listener for event ${event}:`, e);
      }
    });
  }
}

export const realtimeEvents = new RealtimeEventEmitter();
export type { RealtimeEventEmitter };
