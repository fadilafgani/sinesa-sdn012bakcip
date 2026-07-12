import { useAnswerStore } from '@/features/answer/stores/answer-store';
import { useSessionStore } from '@/features/session/stores/session-store';
import { useParticipantStore } from '@/features/participant/stores/participant-store';
import { useQuestionStore } from '@/features/question/stores/question-store';
import { useLeaderboardStore } from '@/features/leaderboard/stores/leaderboard-store';
import { checkIsMock } from '@/features/auth/stores/auth-store';
import { AnswerService } from '@/features/answer/services/answer.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { LeaderboardService } from '@/features/leaderboard/services/leaderboard.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { AnalyticsService } from '@/shared/services/analytics.service';
import type { Answer, Participant } from '@/types';

const refreshAuth = async () => {
  await AuthService.refreshSession();
};

export const answerActions = {
  submitAnswer: async (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    if (!session) return;

    const participant = useParticipantStore.getState().participant;
    const currentQuestion = useQuestionStore.getState().currentQuestion;
    const currentOptions = useQuestionStore.getState().currentOptions;
    const hasAnswered = useAnswerStore.getState().hasAnswered;

    if (!participant || !currentQuestion || hasAnswered) return;

    const isMock = checkIsMock();
    let isCorrect = false;
    let optionIdToSave: string | null = null;
    let optionIdsToSave: string[] | null = null;
    let matchingAnswersToSave: Record<string, string> | null = null;

    const qType = currentQuestion.question_type || 'multiple_choice';

    if (typeof arg === 'string') {
      const option = currentOptions.find(o => o.id === arg);
      if (option) {
        isCorrect = option.is_correct;
        optionIdToSave = arg;
      }
    } else {
      if (qType === 'multiple_answer') {
        const selectedIds = arg.optionIds || [];
        const correctIds = currentOptions.filter(o => o.is_correct).map(o => o.id);
        isCorrect = correctIds.length === selectedIds.length && correctIds.every(id => selectedIds.includes(id));
        optionIdsToSave = selectedIds;
      } else if (qType === 'matching') {
        const matchingPairs = arg.matchingAnswers || {};
        isCorrect = currentOptions.every(o => matchingPairs[o.id] === o.match_text);
        matchingAnswersToSave = matchingPairs;
      } else {
        const optId = arg.optionId || '';
        const option = currentOptions.find(o => o.id === optId);
        if (option) {
          isCorrect = option.is_correct;
          optionIdToSave = optId;
        }
      }
    }

    const now = new Date();
    const startedAt = session.question_started_at ? new Date(session.question_started_at) : now;
    const responseTime = Math.max(0, now.getTime() - startedAt.getTime());
    const scoreAwarded = isCorrect ? currentQuestion.points : 0;

    let newLives = useParticipantStore.getState().lives;
    const quiz = useSessionStore.getState().quiz;
    const initialLives = quiz?.lives_count ?? 3;
    if (!isCorrect && session.quiz_mode === 'santai' && initialLives > 0) {
      newLives = Math.max(0, newLives - 1);
    }

    const questionStatus = useAnswerStore.getState().questionStatus;
    const updatedStatuses = { ...questionStatus, [currentQuestion.id]: 'answered' as const };

    if (isMock) {
      const answersKey = `answers_${session.id}`;
      const answers = JSON.parse(localStorage.getItem(answersKey) || '[]');
      const newAnswer: Answer = {
        id: `ans-mock-player-${Date.now()}`,
        participant_id: participant.id,
        question_id: currentQuestion.id,
        selected_option_id: optionIdToSave,
        selected_option_ids: optionIdsToSave,
        matching_answers: matchingAnswersToSave,
        is_correct: isCorrect,
        response_time_ms: responseTime,
        score_awarded: scoreAwarded,
        answered_at: now.toISOString(),
      };
      localStorage.setItem(answersKey, JSON.stringify([...answers, newAnswer]));

      const newScore = participant.score + scoreAwarded;
      const updatedPart = {
        ...participant,
        score: newScore,
        lives: newLives,
        question_status: updatedStatuses
      };

      const partsKey = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
      const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
      localStorage.setItem(partsKey, JSON.stringify(updatedParts));

      useParticipantStore.setState({ participant: updatedPart, lives: newLives });
      useAnswerStore.setState({
        questionStatus: updatedStatuses,
        hasAnswered: true,
        isAnswerCorrect: isCorrect,
        scoreAwarded,
      });
      return;
    }

    try {
      const insertRes = await AnswerService.submitAnswer({
        participant_id: participant.id,
        question_id: currentQuestion.id,
        selected_option_id: optionIdToSave,
        selected_option_ids: optionIdsToSave,
        matching_answers: matchingAnswersToSave,
        is_correct: isCorrect,
        response_time_ms: responseTime,
        score_awarded: scoreAwarded,
      });

      if (!insertRes.success) throw insertRes.error;

      const newScore = participant.score + scoreAwarded;
      const updateRes = await ParticipantService.updateParticipant(participant.id, {
        score: newScore,
        lives: newLives,
        question_status: updatedStatuses,
      });

      if (!updateRes.success) throw updateRes.error;
      const updatedPart = updateRes.data;

      if (updatedPart) {
        useParticipantStore.setState({ participant: updatedPart as Participant, lives: newLives });
        useAnswerStore.setState({
          questionStatus: updatedStatuses,
          hasAnswered: true,
          isAnswerCorrect: isCorrect,
          scoreAwarded,
        });
      }
    } catch (err: any) {
      console.error('Error submitting answer:', err);
      useAnswerStore.setState({
        hasAnswered: false,
        isAnswerCorrect: null,
        scoreAwarded: 0,
      });
    }
  },

  submitSelfPacedAnswer: async (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    const participant = useParticipantStore.getState().participant;
    const currentQuestion = useQuestionStore.getState().currentQuestion;
    const currentOptions = useQuestionStore.getState().currentOptions;
    const hasAnswered = useAnswerStore.getState().hasAnswered;
    const questionStatus = useAnswerStore.getState().questionStatus;
    const answersMap = useAnswerStore.getState().answersMap;
    const questionStartedAt = useAnswerStore.getState().questionStartedAt;

    if (!session || !participant || !currentQuestion || hasAnswered) return;

    const isMock = checkIsMock();
    let isCorrect = false;
    let optionIdToSave: string | null = null;
    let optionIdsToSave: string[] | null = null;
    let matchingAnswersToSave: Record<string, string> | null = null;

    const qType = currentQuestion.question_type || 'multiple_choice';

    if (typeof arg === 'string') {
      const option = currentOptions.find(o => o.id === arg);
      if (option) {
        isCorrect = option.is_correct;
        optionIdToSave = arg;
      }
    } else {
      if (qType === 'multiple_answer') {
        const selectedIds = arg.optionIds || [];
        const correctIds = currentOptions.filter(o => o.is_correct).map(o => o.id);
        isCorrect = correctIds.length === selectedIds.length && correctIds.every(id => selectedIds.includes(id));
        optionIdsToSave = selectedIds;
      } else if (qType === 'matching') {
        const matchingPairs = arg.matchingAnswers || {};
        isCorrect = currentOptions.every(o => matchingPairs[o.id] === o.match_text);
        matchingAnswersToSave = matchingPairs;
      } else {
        const optId = arg.optionId || '';
        const option = currentOptions.find(o => o.id === optId);
        if (option) {
          isCorrect = option.is_correct;
          optionIdToSave = optId;
        }
      }
    }

    const responseTime = questionStartedAt > 0 ? Date.now() - questionStartedAt : 0;
    const scoreAwarded = isCorrect ? currentQuestion.points : 0;

    let newLives = useParticipantStore.getState().lives;
    const quiz = useSessionStore.getState().quiz;
    const initialLives = quiz?.lives_count ?? 3;
    if (!isCorrect && session.quiz_mode === 'santai' && initialLives > 0) {
      newLives = Math.max(0, newLives - 1);
    }

    const updatedStatuses = { ...questionStatus, [currentQuestion.id]: 'answered' as const };

    const newAnswer: Answer = {
      id: `ans-${isMock ? 'mock' : 'real'}-${Date.now()}`,
      participant_id: participant.id,
      question_id: currentQuestion.id,
      selected_option_id: optionIdToSave,
      selected_option_ids: optionIdsToSave,
      matching_answers: matchingAnswersToSave,
      is_correct: isCorrect,
      response_time_ms: responseTime,
      score_awarded: scoreAwarded,
      answered_at: new Date().toISOString(),
    };

    const newScore = participant.score + scoreAwarded;
    const updatedPart = {
      ...participant,
      score: newScore,
      lives: newLives,
      question_status: updatedStatuses
    };

    const updatedAnswersMap = { ...answersMap, [currentQuestion.id]: newAnswer };

    useParticipantStore.setState({ participant: updatedPart, lives: newLives });
    useAnswerStore.setState({
      questionStatus: updatedStatuses,
      answersMap: updatedAnswersMap,
      hasAnswered: true,
      isAnswerCorrect: isCorrect,
      scoreAwarded
    });

    const answersKey = `answers_${session.id}`;
    if (isMock) {
      const answers = JSON.parse(localStorage.getItem(answersKey) || '[]');
      localStorage.setItem(answersKey, JSON.stringify([...answers, newAnswer]));

      const partsKey = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
      const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
      localStorage.setItem(partsKey, JSON.stringify(updatedParts));
    } else {
      try {
        await AnswerService.submitAnswer({
          participant_id: participant.id,
          question_id: currentQuestion.id,
          selected_option_id: optionIdToSave,
          selected_option_ids: optionIdsToSave,
          matching_answers: matchingAnswersToSave,
          is_correct: isCorrect,
          response_time_ms: responseTime,
          score_awarded: scoreAwarded,
        });

        await ParticipantService.updateParticipant(participant.id, {
          score: newScore,
          lives: newLives,
          question_status: updatedStatuses
        });
      } catch (e) {
        console.error('Failed to submit self-paced answer:', e);
      }
    }

    if (newLives === 0 && session.quiz_mode === 'santai' && initialLives > 0) {
      await answerActions.submitFinalQuiz();
    }
  },

  submitFinalQuiz: async () => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    const participant = useParticipantStore.getState().participant;
    if (!session || !participant) return;

    const isMock = checkIsMock();
    const updatedPart = { ...participant, is_completed: true };

    useParticipantStore.setState({ participant: updatedPart });
    useAnswerStore.setState({ isCompleted: true });

    if (isMock) {
      const partsKey = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
      const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
      localStorage.setItem(partsKey, JSON.stringify(updatedParts));
    } else {
      try {
        await ParticipantService.updateParticipant(participant.id, { is_completed: true });
      } catch (e) {
        console.error('Failed to submit final quiz:', e);
      }
    }
    AnalyticsService.trackEvent('finish_quiz', { isMock, sessionId: session.id, participantId: participant.id });
  },

  saveAnswerState: (_questionId: string, _answerData: any) => {
    // Local state is automatically updated during submits or skips.
  },

  fetchLeaderboard: async (): Promise<Participant[]> => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    if (!session) return [];
    const isMock = checkIsMock();
    if (isMock) {
      const key = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(key) || '[]');
      const sorted = parts.sort((a: any, b: any) => b.score - a.score);
      useLeaderboardStore.setState({ leaderboard: sorted });
      return sorted;
    }

    try {
      const res = await LeaderboardService.getLeaderboard(session.id);
      if (!res.success) throw res.error;
      const data = res.data || [];
      useLeaderboardStore.setState({ leaderboard: data });
      return data;
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
      return [];
    }
  },

  fetchQuestionStats: async (questionId: string) => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    if (!session) return null;
    const isMock = checkIsMock();
    if (isMock) {
      return {
        correctCount: 4,
        incorrectCount: 1,
        totalCount: 5
      };
    }

    try {
      const ansRes = await AnswerService.getAnswersForQuestion(session.id, questionId);
      if (!ansRes.success) throw ansRes.error;
      const answers = ansRes.data || [];
      if (answers.length === 0) {
        return { correctCount: 0, incorrectCount: 0, totalCount: 0 };
      }

      const correctCount = answers.filter(a => a.is_correct).length;
      const totalCount = answers.length;
      const incorrectCount = totalCount - correctCount;

      return { correctCount, incorrectCount, totalCount };
    } catch (e) {
      console.error('Failed to fetch question stats:', e);
      return null;
    }
  },

  incrementViolation: async () => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    const participant = useParticipantStore.getState().participant;
    if (!session || !participant) return;

    const isMock = checkIsMock();
    const newViolationCount = (participant.violation_count || 0) + 1;
    const updatedPart = { ...participant, violation_count: newViolationCount };

    useParticipantStore.setState({ participant: updatedPart });

    if (isMock) {
      const partsKey = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
      const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
      localStorage.setItem(partsKey, JSON.stringify(updatedParts));
    } else {
      try {
        await ParticipantService.updateParticipant(participant.id, { violation_count: newViolationCount });
      } catch (e) {
        console.error('Failed to update violation count:', e);
      }
    }

    const limit = session.auto_submit_on_violation ?? 3;
    if (newViolationCount >= limit) {
      await answerActions.submitFinalQuiz();
    }
  }
};
