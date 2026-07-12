import { create } from 'zustand';
import type { QuestionState } from './question-types';

export const useQuestionStore = create<QuestionState>((set) => ({
  questions: [],
  currentQuestionIndex: 0,
  currentQuestion: null,
  currentOptions: [],

  setQuestions: (questions) => set({ questions }),
  setCurrentQuestionIndex: (currentQuestionIndex) => set({ currentQuestionIndex }),
  setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
  setCurrentOptions: (currentOptions) => set({ currentOptions }),
  resetQuestionStore: () => set({
    questions: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    currentOptions: []
  })
}));
export const questionStore = useQuestionStore;
