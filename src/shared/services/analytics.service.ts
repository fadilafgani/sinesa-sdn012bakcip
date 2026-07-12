import { Logger } from '@/shared/utils/logger';

interface AnalyticsEvent {
  eventName: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// In-memory array to cache events locally in case we want to sync/inspect them later
const localEventsLog: AnalyticsEvent[] = [];

export const AnalyticsService = {
  trackEvent(eventName: 'login' | 'logout' | 'join_quiz' | 'finish_quiz' | 'error' | 'performance', metadata?: Record<string, any>) {
    const event: AnalyticsEvent = {
      eventName,
      timestamp: new Date().toISOString(),
      metadata,
    };

    localEventsLog.push(event);
    
    // Limits local logs size to 100 entries to prevent memory leak
    if (localEventsLog.length > 100) {
      localEventsLog.shift();
    }

    Logger.activity(`Analytics Tracked: ${eventName}`, metadata);
  },

  getEvents(): AnalyticsEvent[] {
    return [...localEventsLog];
  },

  clearEvents() {
    localEventsLog.length = 0;
  }
};
