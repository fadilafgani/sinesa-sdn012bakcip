import type { QuizSession, Quiz } from '@/types';
import type { RealtimeStatus } from '@/core/realtime/realtime-types';

export interface SessionState {
  activeSession: QuizSession | null; // For host/teacher
  session: QuizSession | null;       // For play/student
  quiz: Quiz | null;
  timer: number;
  countdownTimer: number;
  pollingInterval: number | null;
  serverTimeOffset: number;
  realtimeStatus: RealtimeStatus;
  virtualStudentIntervals: number[];

  setActiveSession: (session: QuizSession | null) => void;
  setPlaySession: (session: QuizSession | null) => void;
  setQuiz: (quiz: Quiz | null) => void;
  setTimer: (timer: number) => void;
  setCountdownTimer: (timer: number) => void;
  setPollingInterval: (interval: number | null) => void;
  setServerTimeOffset: (offset: number) => void;
  setRealtimeStatus: (status: RealtimeStatus) => void;
  setVirtualStudentIntervals: (intervals: number[]) => void;
  resetSessionStore: () => void;
}
