import { create } from 'zustand';
import type { Answer } from '@/types';

export interface AnswerState {
  submissions: Answer[];
  hasAnswered: boolean;
  isAnswerCorrect: boolean | null;
  scoreAwarded: number;
  skippedQuestions: string[];
  questionStatus: Record<string, 'unanswered' | 'answered' | 'skipped'>;
  answersMap: Record<string, Answer>;
  isCompleted: boolean;
  questionStartedAt: number;

  setSubmissions: (submissions: Answer[]) => void;
  setHasAnswered: (hasAnswered: boolean) => void;
  setIsAnswerCorrect: (isAnswerCorrect: boolean | null) => void;
  setScoreAwarded: (scoreAwarded: number) => void;
  setSkippedQuestions: (skippedQuestions: string[]) => void;
  setQuestionStatus: (questionStatus: Record<string, 'unanswered' | 'answered' | 'skipped'>) => void;
  setAnswersMap: (answersMap: Record<string, Answer>) => void;
  setIsCompleted: (isCompleted: boolean) => void;
  setQuestionStartedAt: (questionStartedAt: number) => void;
  resetAnswerStore: () => void;
}

export const useAnswerStore = create<AnswerState>((set) => ({
  submissions: [],
  hasAnswered: false,
  isAnswerCorrect: null,
  scoreAwarded: 0,
  skippedQuestions: [],
  questionStatus: {},
  answersMap: {},
  isCompleted: false,
  questionStartedAt: 0,

  setSubmissions: (submissions) => set({ submissions }),
  setHasAnswered: (hasAnswered) => set({ hasAnswered }),
  setIsAnswerCorrect: (isAnswerCorrect) => set({ isAnswerCorrect }),
  setScoreAwarded: (scoreAwarded) => set({ scoreAwarded }),
  setSkippedQuestions: (skippedQuestions) => set({ skippedQuestions }),
  setQuestionStatus: (questionStatus) => set({ questionStatus }),
  setAnswersMap: (answersMap) => set({ answersMap }),
  setIsCompleted: (isCompleted) => set({ isCompleted }),
  setQuestionStartedAt: (questionStartedAt) => set({ questionStartedAt }),
  resetAnswerStore: () => set({
    submissions: [],
    hasAnswered: false,
    isAnswerCorrect: null,
    scoreAwarded: 0,
    skippedQuestions: [],
    questionStatus: {},
    answersMap: {},
    isCompleted: false,
    questionStartedAt: 0
  })
}));
export const answerStore = useAnswerStore;
