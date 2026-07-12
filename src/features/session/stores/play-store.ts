import { useSessionStore } from '@/features/session/stores/session-store';
import { useQuestionStore } from '@/features/question/stores/question-store';
import { useParticipantStore } from '@/features/participant/stores/participant-store';
import { useAnswerStore } from '@/features/answer/stores/answer-store';
import { useUiStore } from '@/shared/stores/ui-store';
import { sessionActions } from '@/features/session/stores/session-actions';
import { questionActions } from '@/features/question/stores/question-actions';
import { answerActions } from '@/features/answer/stores/answer-actions';
import type { QuizSession, Quiz, Participant, Question, Option, Answer } from '@/types';
import type { RealtimeStatus } from '@/core/realtime/realtime-types';

export interface PlayState {
  session: QuizSession | null;
  quiz: Quiz | null;
  participant: Participant | null;
  currentQuestion: Question | null;
  currentOptions: Option[];
  hasAnswered: boolean;
  isAnswerCorrect: boolean | null;
  scoreAwarded: number;
  loading: boolean;
  error: string | null;
  pollingInterval: number | null;
  serverTimeOffset: number;
  realtimeStatus: RealtimeStatus;

  questions: Question[];
  currentQuestionIndex: number;
  lives: number;
  skippedQuestions: string[];
  questionStatus: Record<string, 'unanswered' | 'answered' | 'skipped'>;
  answersMap: Record<string, Answer>;
  isCompleted: boolean;
  questionStartedAt: number;

  joinSession: (pinCode: string, displayName: string, studentId?: string) => Promise<boolean>;
  submitAnswer: (arg: any) => Promise<void>;
  listenToSession: (sessionId: string) => void;
  stopListening: () => void;
  leaveSession: () => void;
  handleSessionUpdate: (updatedSess: QuizSession) => Promise<void>;

  setQuestionProgress: (index: number) => Promise<void>;
  skipQuestion: (questionId: string) => Promise<void>;
  submitSelfPacedAnswer: (arg: any) => Promise<void>;
  submitFinalQuiz: () => Promise<void>;
  saveAnswerState: (questionId: string, answerData: any) => void;
  fetchLeaderboard: () => Promise<Participant[]>;
  fetchQuestionStats: (questionId: string) => Promise<{ correctCount: number; incorrectCount: number; totalCount: number } | null>;
  incrementViolation: () => Promise<void>;
}

// Global actions definition that are static and do not trigger re-renders
const actions = {
  joinSession: sessionActions.joinSession,
  submitAnswer: answerActions.submitAnswer,
  listenToSession: sessionActions.listenToSession,
  stopListening: sessionActions.stopListening,
  leaveSession: sessionActions.leaveSession,
  handleSessionUpdate: sessionActions.handleSessionUpdate,

  setQuestionProgress: questionActions.setQuestionProgress,
  skipQuestion: questionActions.skipQuestion,
  submitSelfPacedAnswer: answerActions.submitSelfPacedAnswer,
  submitFinalQuiz: answerActions.submitFinalQuiz,
  saveAnswerState: answerActions.saveAnswerState,
  fetchLeaderboard: answerActions.fetchLeaderboard,
  fetchQuestionStats: answerActions.fetchQuestionStats,
  incrementViolation: answerActions.incrementViolation,
};

export function usePlayStore<T = PlayState>(selector?: (state: PlayState) => T): T {
  // Read states from individual stores
  const session = useSessionStore(state => state.session);
  const quiz = useSessionStore(state => state.quiz);
  const participant = useParticipantStore(state => state.participant);
  const currentQuestion = useQuestionStore(state => state.currentQuestion);
  const currentOptions = useQuestionStore(state => state.currentOptions);
  const hasAnswered = useAnswerStore(state => state.hasAnswered);
  const isAnswerCorrect = useAnswerStore(state => state.isAnswerCorrect);
  const scoreAwarded = useAnswerStore(state => state.scoreAwarded);
  const loading = useUiStore(state => state.loading);
  const error = useUiStore(state => state.error);
  const pollingInterval = useSessionStore(state => state.pollingInterval);
  const serverTimeOffset = useSessionStore(state => state.serverTimeOffset);
  const realtimeStatus = useSessionStore(state => state.realtimeStatus);
  const questions = useQuestionStore(state => state.questions);
  const currentQuestionIndex = useQuestionStore(state => state.currentQuestionIndex);
  const lives = useParticipantStore(state => state.lives);
  const skippedQuestions = useAnswerStore(state => state.skippedQuestions);
  const questionStatus = useAnswerStore(state => state.questionStatus);
  const answersMap = useAnswerStore(state => state.answersMap);
  const isCompleted = useAnswerStore(state => state.isCompleted);
  const questionStartedAt = useAnswerStore(state => state.questionStartedAt);

  const state: PlayState = {
    session,
    quiz,
    participant,
    currentQuestion,
    currentOptions,
    hasAnswered,
    isAnswerCorrect,
    scoreAwarded,
    loading,
    error,
    pollingInterval,
    serverTimeOffset,
    realtimeStatus,
    questions,
    currentQuestionIndex,
    lives,
    skippedQuestions,
    questionStatus,
    answersMap,
    isCompleted,
    questionStartedAt,
    ...actions,
  };

  const select = selector || ((s) => s as unknown as T);
  return select(state);
}

usePlayStore.getState = (): PlayState => {
  return {
    session: useSessionStore.getState().session,
    quiz: useSessionStore.getState().quiz,
    participant: useParticipantStore.getState().participant,
    currentQuestion: useQuestionStore.getState().currentQuestion,
    currentOptions: useQuestionStore.getState().currentOptions,
    hasAnswered: useAnswerStore.getState().hasAnswered,
    isAnswerCorrect: useAnswerStore.getState().isAnswerCorrect,
    scoreAwarded: useAnswerStore.getState().scoreAwarded,
    loading: useUiStore.getState().loading,
    error: useUiStore.getState().error,
    pollingInterval: useSessionStore.getState().pollingInterval,
    serverTimeOffset: useSessionStore.getState().serverTimeOffset,
    realtimeStatus: useSessionStore.getState().realtimeStatus,
    questions: useQuestionStore.getState().questions,
    currentQuestionIndex: useQuestionStore.getState().currentQuestionIndex,
    lives: useParticipantStore.getState().lives,
    skippedQuestions: useAnswerStore.getState().skippedQuestions,
    questionStatus: useAnswerStore.getState().questionStatus,
    answersMap: useAnswerStore.getState().answersMap,
    isCompleted: useAnswerStore.getState().isCompleted,
    questionStartedAt: useAnswerStore.getState().questionStartedAt,
    ...actions,
  };
};

usePlayStore.subscribe = (listener: () => void) => {
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

export const playStore = usePlayStore;
