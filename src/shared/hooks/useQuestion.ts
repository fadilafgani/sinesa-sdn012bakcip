import { useQuestionStore } from '@/features/question/stores/question-store';
import { questionActions } from '@/features/question/stores/question-actions';
import { useShallow } from 'zustand/shallow';

export const useQuestion = () => {
  const questionState = useQuestionStore(
    useShallow(state => ({
      questions: state.questions,
      currentQuestion: state.currentQuestion,
      currentOptions: state.currentOptions,
      currentQuestionIndex: state.currentQuestionIndex,
    }))
  );

  return {
    ...questionState,
    fetchQuestions: questionActions.fetchQuestions,
    skipQuestion: questionActions.skipQuestion,
    setQuestionProgress: questionActions.setQuestionProgress,
  };
};
export default useQuestion;
