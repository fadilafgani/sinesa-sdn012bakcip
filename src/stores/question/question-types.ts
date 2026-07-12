import type { Question, Option } from '@/types';

export interface QuestionState {
  questions: Question[];
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  currentOptions: Option[];

  setQuestions: (questions: Question[]) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setCurrentQuestion: (question: Question | null) => void;
  setCurrentOptions: (options: Option[]) => void;
  resetQuestionStore: () => void;
}
