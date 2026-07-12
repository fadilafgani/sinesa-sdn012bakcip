import { useQuestionStore } from './question-store';
import { useSessionStore } from '../session/session-store';
import { useParticipantStore } from '../participant/participant-store';
import { useAnswerStore } from '../answer/answer-store';
import { checkIsMock } from '@/features/auth/stores/auth-store';
import { QuestionService } from '@/features/question/services/question.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { AuthService } from '@/features/auth/services/auth.service';
import type { Question, Option } from '@/types';

const refreshAuth = async () => {
  await AuthService.refreshSession();
};

async function fetchOptionsById(questionId: string): Promise<Option[]> {
  if (checkIsMock()) {
    const raw = localStorage.getItem(`options_${questionId}`);
    return raw ? JSON.parse(raw) : [];
  }
  const res = await QuestionService.getQuestionOptions(questionId);
  return res.success && res.data ? res.data : [];
}

export const questionActions = {
  fetchQuestions: async (quizId: string): Promise<Question[]> => {
    const isMock = checkIsMock();
    if (isMock) {
      const rawQs = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
      useQuestionStore.setState({ questions: rawQs });
      return rawQs;
    }
    await refreshAuth();
    try {
      const res = await QuestionService.getQuestions(quizId);
      if (res.success && res.data) {
        useQuestionStore.setState({ questions: res.data });
        return res.data;
      }
    } catch (err) {
      console.error('Error in fetchQuestions action:', err);
    }
    return [];
  },

  setQuestionProgress: async (index: number) => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    const participant = useParticipantStore.getState().participant;
    const questions = useQuestionStore.getState().questions;
    const answersMap = useAnswerStore.getState().answersMap;

    if (!session || !participant || index < 0 || index >= questions.length) return;

    const activeQ = questions[index];
    const isMock = checkIsMock();

    let options: Option[] = [];
    try {
      options = await fetchOptionsById(activeQ.id);
    } catch (err) {
      console.error('setQuestionProgress failed to fetch options:', err);
      throw new Error('Gagal memuat pilihan jawaban dari server. Harap periksa jaringan Anda.');
    }

    const answeredObj = answersMap[activeQ.id];
    const hasAns = !!answeredObj;

    useQuestionStore.setState({
      currentQuestionIndex: index,
      currentQuestion: activeQ,
      currentOptions: options,
    });

    useAnswerStore.setState({
      hasAnswered: hasAns,
      isAnswerCorrect: hasAns ? answeredObj.is_correct : null,
      scoreAwarded: hasAns ? answeredObj.score_awarded : 0,
      questionStartedAt: Date.now()
    });

    const updatedPart = { ...participant, current_progress: index };
    useParticipantStore.setState({ participant: updatedPart });

    try {
      if (isMock) {
        const partsKey = `participants_${session.id}`;
        const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
        const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
        localStorage.setItem(partsKey, JSON.stringify(updatedParts));
      } else {
        const res = await ParticipantService.updateParticipant(participant.id, { current_progress: index });
        if (!res.success) throw res.error;
      }
    } catch (err) {
      console.warn('Failed to update current progress on server:', err);
    }
  },

  skipQuestion: async (questionId: string) => {
    await refreshAuth();

    const session = useSessionStore.getState().session;
    const participant = useParticipantStore.getState().participant;
    const questionStatus = useAnswerStore.getState().questionStatus;
    const skippedQuestions = useAnswerStore.getState().skippedQuestions;
    const currentQuestionIndex = useQuestionStore.getState().currentQuestionIndex;
    const questions = useQuestionStore.getState().questions;

    if (!session || !participant) return;

    const isMock = checkIsMock();
    const updatedStatuses = { ...questionStatus, [questionId]: 'skipped' as const };
    const updatedSkipped = skippedQuestions.includes(questionId)
      ? skippedQuestions
      : [...skippedQuestions, questionId];

    const updatedPart = {
      ...participant,
      question_status: updatedStatuses,
      skipped_questions: updatedSkipped
    };

    useAnswerStore.setState({
      questionStatus: updatedStatuses,
      skippedQuestions: updatedSkipped,
    });
    useParticipantStore.setState({ participant: updatedPart });

    if (isMock) {
      const partsKey = `participants_${session.id}`;
      const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
      const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
      localStorage.setItem(partsKey, JSON.stringify(updatedParts));
    } else {
      await ParticipantService.updateParticipant(participant.id, {
        question_status: updatedStatuses,
        skipped_questions: updatedSkipped,
      });
    }

    if (currentQuestionIndex + 1 < questions.length) {
      await questionActions.setQuestionProgress(currentQuestionIndex + 1);
    }
  }
};
