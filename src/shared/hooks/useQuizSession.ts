import { useSessionStore } from '@/features/session/stores/session-store';
import { sessionActions } from '@/features/session/stores/session-actions';
import { useShallow } from 'zustand/shallow';

export const useQuizSession = () => {
  const sessionState = useSessionStore(
    useShallow(state => ({
      activeSession: state.activeSession, // for host
      session: state.session,             // for play
      quiz: state.quiz,
      realtimeStatus: state.realtimeStatus,
      pollingInterval: state.pollingInterval,
      serverTimeOffset: state.serverTimeOffset,
      virtualStudentIntervals: state.virtualStudentIntervals,
    }))
  );

  return {
    ...sessionState,
    createSession: sessionActions.createSession,
    startQuiz: sessionActions.startQuiz,
    nextQuestion: sessionActions.nextQuestion,
    endQuiz: sessionActions.endQuiz,
    clearSession: sessionActions.clearSession,
    joinSession: sessionActions.joinSession,
    leaveSession: sessionActions.leaveSession,
    listenToSession: sessionActions.listenToSession,
    stopListening: sessionActions.stopListening,
    publishQuestionStage: sessionActions.publishQuestionStage,
    handleSessionUpdate: sessionActions.handleSessionUpdate,
    showLeaderboard: sessionActions.showLeaderboard,
    revealAnswer: sessionActions.revealAnswer,
    subscribeToLobby: sessionActions.subscribeToLobby,
    subscribeToAnswers: sessionActions.subscribeToAnswers,
    subscribeToSession: sessionActions.subscribeToSession,
    unsubscribeAll: sessionActions.unsubscribeAll,
    fetchParticipants: sessionActions.fetchParticipants,
    fetchAnswers: sessionActions.fetchAnswers,
  };
};
export default useQuizSession;
