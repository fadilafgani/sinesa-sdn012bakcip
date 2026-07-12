import { create } from 'zustand';
import type { SessionState } from './session-types';

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  session: null,
  quiz: null,
  timer: 0,
  countdownTimer: 0,
  pollingInterval: null,
  serverTimeOffset: 0,
  realtimeStatus: 'DISCONNECTED',
  virtualStudentIntervals: [],

  setActiveSession: (activeSession) => set({ activeSession }),
  setPlaySession: (session) => set({ session }),
  setQuiz: (quiz) => set({ quiz }),
  setTimer: (timer) => set({ timer }),
  setCountdownTimer: (countdownTimer) => set({ countdownTimer }),
  setPollingInterval: (pollingInterval) => set({ pollingInterval }),
  setServerTimeOffset: (serverTimeOffset) => set({ serverTimeOffset }),
  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),
  setVirtualStudentIntervals: (virtualStudentIntervals) => set({ virtualStudentIntervals }),
  resetSessionStore: () => set({
    activeSession: null,
    session: null,
    quiz: null,
    timer: 0,
    countdownTimer: 0,
    pollingInterval: null,
    serverTimeOffset: 0,
    realtimeStatus: 'DISCONNECTED',
    virtualStudentIntervals: []
  })
}));
export const sessionStore = useSessionStore;
