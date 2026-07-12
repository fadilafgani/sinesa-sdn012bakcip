import { useAnswerStore } from '@/features/answer/stores/answer-store';
import { answerActions } from '@/features/answer/stores/answer-actions';
import { useShallow } from 'zustand/shallow';

export const useAnswer = () => {
  const answerState = useAnswerStore(
    useShallow(state => ({
      submissions: state.submissions,
      hasAnswered: state.hasAnswered,
      isAnswerCorrect: state.isAnswerCorrect,
      scoreAwarded: state.scoreAwarded,
      skippedQuestions: state.skippedQuestions,
      questionStatus: state.questionStatus,
      answersMap: state.answersMap,
      isCompleted: state.isCompleted,
      questionStartedAt: state.questionStartedAt,
    }))
  );

  return {
    ...answerState,
    submitAnswer: answerActions.submitAnswer,
    incrementViolation: answerActions.incrementViolation,
    fetchQuestionStats: answerActions.fetchQuestionStats,
    fetchLeaderboard: answerActions.fetchLeaderboard,
    submitSelfPacedAnswer: answerActions.submitSelfPacedAnswer,
    submitFinalQuiz: answerActions.submitFinalQuiz,
  };
};
export default useAnswer;
