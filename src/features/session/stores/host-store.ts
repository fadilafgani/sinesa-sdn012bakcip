import { useSessionStore } from '@/features/session/stores/session-store';
import { useQuestionStore } from '@/features/question/stores/question-store';
import { useParticipantStore } from '@/features/participant/stores/participant-store';
import { useAnswerStore } from '@/features/answer/stores/answer-store';
import { useUiStore } from '@/shared/stores/ui-store';
import { sessionActions } from '@/features/session/stores/session-actions';
import { questionActions } from '@/features/question/stores/question-actions';
import type { Question, QuizSession, Quiz, Participant, Option, Answer } from '@/types';
import type { RealtimeStatus } from '@/core/realtime/realtime-types';

export interface HostState {
  questions: Question[];
  activeSession: QuizSession | null;
  quiz: Quiz | null;
  participants: Participant[];
  currentQuestion: Question | null;
  currentOptions: Option[];
  submissions: Answer[];
  loading: boolean;
  virtualStudentIntervals: number[];
  realtimeStatus: RealtimeStatus;

  createSession: (quizId: string) => Promise<string | null>;
  startQuiz: () => Promise<void>;
  nextQuestion: () => Promise<void>;
  showLeaderboard: () => Promise<void>;
  publishQuestionStage: () => Promise<void>;
  endQuiz: () => Promise<void>;
  revealAnswer: () => Promise<void>;
  clearSession: () => void;
  fetchQuestions: (quizId: string) => Promise<Question[]>;

  subscribeToLobby: (sessionId: string) => void;
  subscribeToAnswers: (sessionId: string) => void;
  subscribeToSession: (sessionId: string) => void;
  unsubscribeAll: () => void;
  fetchParticipants: (sessionId: string) => Promise<void>;
  fetchAnswers: (sessionId: string) => Promise<void>;
}

// Global actions definition that are static and do not trigger re-renders
const actions = {
  createSession: sessionActions.createSession,
  startQuiz: sessionActions.startQuiz,
  nextQuestion: sessionActions.nextQuestion,
  showLeaderboard: sessionActions.showLeaderboard,
  publishQuestionStage: sessionActions.publishQuestionStage,
  endQuiz: sessionActions.endQuiz,
  revealAnswer: sessionActions.revealAnswer,
  clearSession: sessionActions.clearSession,
  fetchQuestions: questionActions.fetchQuestions,
  subscribeToLobby: sessionActions.subscribeToLobby,
  subscribeToAnswers: sessionActions.subscribeToAnswers,
  subscribeToSession: sessionActions.subscribeToSession,
  unsubscribeAll: sessionActions.unsubscribeAll,
  fetchParticipants: sessionActions.fetchParticipants,
  fetchAnswers: sessionActions.fetchAnswers,
};

export function useHostStore<T = HostState>(selector?: (state: HostState) => T): T {
  // Read states from individual stores
  const questions = useQuestionStore(state => state.questions);
  const activeSession = useSessionStore(state => state.activeSession);
  const quiz = useSessionStore(state => state.quiz);
  const participants = useParticipantStore(state => state.participants);
  const currentQuestion = useQuestionStore(state => state.currentQuestion);
  const currentOptions = useQuestionStore(state => state.currentOptions);
  const submissions = useAnswerStore(state => state.submissions);
  const loading = useUiStore(state => state.loading);
  const virtualStudentIntervals = useSessionStore(state => state.virtualStudentIntervals);
  const realtimeStatus = useSessionStore(state => state.realtimeStatus);

  const state: HostState = {
    questions,
    activeSession,
    quiz,
    participants,
    currentQuestion,
    currentOptions,
    submissions,
    loading,
    virtualStudentIntervals,
    realtimeStatus,
    ...actions,
  };

  const select = selector || ((s) => s as unknown as T);
  return select(state);
}

useHostStore.getState = (): HostState => {
  return {
    questions: useQuestionStore.getState().questions,
    activeSession: useSessionStore.getState().activeSession,
    quiz: useSessionStore.getState().quiz,
    participants: useParticipantStore.getState().participants,
    currentQuestion: useQuestionStore.getState().currentQuestion,
    currentOptions: useQuestionStore.getState().currentOptions,
    submissions: useAnswerStore.getState().submissions,
    loading: useUiStore.getState().loading,
    virtualStudentIntervals: useSessionStore.getState().virtualStudentIntervals,
    realtimeStatus: useSessionStore.getState().realtimeStatus,
    ...actions,
  };
};

useHostStore.subscribe = (listener: () => void) => {
  const unsub1 = useSessionStore.subscribe(listener);
  const unsub2 = useQuestionStore.subscribe(listener);
  const unsub3 = useParticipantStore.subscribe(listener);
  const unsub4 = useAnswerStore.subscribe(listener);
  const unsub5 = useUiStore.subscribe(listener);

  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
    unsub5();
  };
};

export const hostStore = useHostStore;
