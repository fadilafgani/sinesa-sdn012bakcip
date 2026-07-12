import { useSessionStore } from '@/features/session/stores/session-store';
import { useQuestionStore } from '@/features/question/stores/question-store';
import { useParticipantStore } from '@/features/participant/stores/participant-store';
import { useAnswerStore } from '@/features/answer/stores/answer-store';
import { useUiStore } from '@/shared/stores/ui-store';
import { checkIsMock } from '@/features/auth/stores/auth-store';
import { QuizService } from '@/features/quiz/services/quiz.service';
import { SessionService } from '@/features/session/services/session.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { AnswerService } from '@/features/answer/services/answer.service';
import { QuestionService } from '@/features/question/services/question.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { RealtimeManager } from '@/core/realtime/realtime-manager';
import { realtimeEvents } from '@/core/realtime/realtime-events';
import { AnalyticsService } from '@/shared/services/analytics.service';
import type { Participant, QuizSession, Question, Option, Answer, Quiz } from '@/types';

const VIRTUAL_NAMES = ['Budi Santoso', 'Ani Wijaya', 'Dedi Kurniawan', 'Siti Rahma', 'Joko Susilo', 'Rini Astuti'];
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';

let realtimeUnsubs: (() => void)[] = [];
let creationPromise: Promise<string | null> | null = null;
let joinPromise: Promise<boolean> | null = null;

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

async function updateSessionStage(
  sessionId: string,
  updates: Partial<QuizSession>,
  fullSession: QuizSession,
  extraLocalState?: any
): Promise<void> {
  const isMock = checkIsMock();
  if (isMock) {
    localStorage.setItem(`session_${sessionId}`, JSON.stringify(fullSession));
    useSessionStore.setState({ activeSession: fullSession });
    if (extraLocalState) {
      if ('currentQuestion' in extraLocalState) {
        useQuestionStore.setState({ currentQuestion: extraLocalState.currentQuestion });
      }
    }
    return;
  }
  await refreshAuth();
  console.log('[SYNC] HostStore: Updating DB with', updates);
  const res = await SessionService.updateSession(sessionId, updates);
  if (!res.success) throw res.error;
  console.log('[SYNC] HostStore: DB updated. Setting local state...');
  useSessionStore.setState({ activeSession: fullSession });
  if (extraLocalState) {
    if ('currentQuestion' in extraLocalState) {
      useQuestionStore.setState({ currentQuestion: extraLocalState.currentQuestion });
    }
  }
}

export const sessionActions = {
  createSession: async (quizId: string): Promise<string | null> => {
    if (creationPromise) {
      console.log('useHostStore: createSession is already in progress, returning existing promise');
      return creationPromise;
    }

    const performCreate = async () => {
      useUiStore.setState({ loading: true });
      const isMock = checkIsMock();
      const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

      if (isMock) {
        const rawQs = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
        const allQuizzes = JSON.parse(localStorage.getItem('quizzes') || '[]');
        const targetQuiz = allQuizzes.find((q: any) => q.id === quizId);

        const newSession: QuizSession = {
          id: `session-mock-${Date.now()}`,
          quiz_id: quizId,
          host_id: 'mock-uuid-teacher',
          status: 'lobby',
          current_stage: 'waiting',
          current_question_index: -1,
          question_started_at: null,
          question_expires_at: null,
          quiz_mode: targetQuiz?.quiz_mode || 'serius',
          lives_count: targetQuiz?.lives_count !== undefined ? targetQuiz.lives_count : 3,
          show_final_result: targetQuiz?.show_final_result !== undefined ? targetQuiz.show_final_result : true,
          show_leaderboard: targetQuiz?.show_leaderboard !== undefined ? targetQuiz.show_leaderboard : true,
          show_correct_answer: targetQuiz?.show_correct_answer !== undefined ? targetQuiz.show_correct_answer : true,
          show_answer_review: targetQuiz?.show_answer_review !== undefined ? targetQuiz.show_answer_review : true,
          show_question_result: targetQuiz?.show_question_result !== undefined ? targetQuiz.show_question_result : true,
          show_explanation: targetQuiz?.show_explanation !== undefined ? targetQuiz.show_explanation : true,
          show_score_per_question: targetQuiz?.show_score_per_question !== undefined ? targetQuiz.show_score_per_question : true,
          show_question_statistics: targetQuiz?.show_question_statistics !== undefined ? targetQuiz.show_question_statistics : true,
          anti_cheat_enabled: targetQuiz?.anti_cheat_enabled !== undefined ? targetQuiz.anti_cheat_enabled : false,
          fullscreen_required: targetQuiz?.fullscreen_required !== undefined ? targetQuiz.fullscreen_required : false,
          auto_submit_on_violation: targetQuiz?.auto_submit_on_violation !== undefined ? targetQuiz.auto_submit_on_violation : 3,
          created_at: new Date().toISOString(),
          completed_at: null,
        };

        localStorage.setItem(`session_${newSession.id}`, JSON.stringify(newSession));
        localStorage.setItem(`participants_${newSession.id}`, JSON.stringify([]));
        localStorage.setItem(`answers_${newSession.id}`, JSON.stringify([]));

        useSessionStore.setState({ activeSession: newSession, quiz: targetQuiz || null });
        useParticipantStore.setState({ participants: [] });
        useAnswerStore.setState({ submissions: [] });
        useQuestionStore.setState({ currentQuestion: null, currentOptions: [], questions: rawQs });
        useUiStore.setState({ loading: false });

        const intervals: number[] = [];
        VIRTUAL_NAMES.forEach((name, idx) => {
          const timeoutId = window.setTimeout(() => {
            const currentSession = useSessionStore.getState().activeSession;
            if (currentSession?.status === 'lobby') {
              const newParticipant: Participant = {
                id: `p-mock-${idx}`,
                session_id: newSession.id,
                student_id: `student-mock-${idx}`,
                display_name: name,
                score: 0,
                lives: targetQuiz?.lives_count !== undefined ? targetQuiz.lives_count : 3,
                skipped_questions: [],
                question_status: {},
                current_progress: 0,
                violation_count: 0,
                is_completed: false,
                joined_at: new Date().toISOString(),
              };
              const currentParticipants = useParticipantStore.getState().participants;
              const updated = [...currentParticipants, newParticipant];
              localStorage.setItem(`participants_${newSession.id}`, JSON.stringify(updated));
              useParticipantStore.setState({ participants: updated });
            }
          }, (idx + 1) * 2000);
          intervals.push(timeoutId);
        });

        useSessionStore.setState({ virtualStudentIntervals: intervals });
        return pinCode;
      }

      try {
        const userRes = await AuthService.getSession();
        const user = userRes.data?.session?.user;
        if (!user) throw new Error('Unauthorized');

        const quizRes = await QuizService.getQuizById(quizId);
        const quizData = quizRes.data;
        if (!quizRes.success || !quizData) throw new Error('Kuis tidak ditemukan.');

        const existingSessionsRes = await SessionService.getActiveSessionsForQuiz(quizId, user.id);
        const existingSessions = existingSessionsRes.data;

        let sessionData = null;
        let isReused = false;

        if (existingSessions && existingSessions.length > 0) {
          sessionData = existingSessions[0];
          isReused = true;
          if (existingSessions.length > 1) {
            const staleIds = existingSessions.slice(1).map(s => s.id);
            await SessionService.terminateSessionsByIds(staleIds);
          }
        } else {
          await SessionService.terminateSessions(quizId);
          const newSessionRes = await SessionService.createSession({
            quiz_id: quizId,
            host_id: user.id,
            status: 'lobby',
            current_stage: 'waiting',
            current_question_index: -1,
            quiz_mode: quizData.quiz_mode || 'serius',
            lives_count: quizData.lives_count !== undefined ? quizData.lives_count : 3,
            show_final_result: quizData.show_final_result !== undefined ? quizData.show_final_result : true,
            show_leaderboard: quizData.show_leaderboard !== undefined ? quizData.show_leaderboard : true,
            show_correct_answer: quizData.show_correct_answer !== undefined ? quizData.show_correct_answer : true,
            show_answer_review: quizData.show_answer_review !== undefined ? quizData.show_answer_review : true,
            show_question_result: quizData.show_question_result !== undefined ? quizData.show_question_result : true,
            show_explanation: quizData.show_explanation !== undefined ? quizData.show_explanation : true,
            show_score_per_question: quizData.show_score_per_question !== undefined ? quizData.show_score_per_question : true,
            show_question_statistics: quizData.show_question_statistics !== undefined ? quizData.show_question_statistics : true,
            anti_cheat_enabled: quizData.anti_cheat_enabled !== undefined ? quizData.anti_cheat_enabled : false,
            fullscreen_required: quizData.fullscreen_required !== undefined ? quizData.fullscreen_required : false,
            auto_submit_on_violation: quizData.auto_submit_on_violation !== undefined ? quizData.auto_submit_on_violation : 3,
            question_started_at: null,
            question_expires_at: null,
          });

          if (!newSessionRes.success || !newSessionRes.data) throw newSessionRes.error || new Error('Failed to create session');
          sessionData = newSessionRes.data;
        }

        const questionsRes = await QuestionService.getQuestions(quizId);
        const loadedQuestions = questionsRes.success && questionsRes.data ? questionsRes.data : [];

        let activeQuestion = null;
        let activeOptions: Option[] = [];
        if (sessionData.status === 'active' && sessionData.current_question_index >= 0) {
          if (loadedQuestions[sessionData.current_question_index]) {
            activeQuestion = loadedQuestions[sessionData.current_question_index];
            const optionsRes = await QuestionService.getQuestionOptions(activeQuestion.id);
            activeOptions = optionsRes.success && optionsRes.data ? optionsRes.data : [];
          }
        }

        useSessionStore.setState({ activeSession: sessionData as QuizSession, quiz: quizData as Quiz });
        useParticipantStore.setState({ participants: [] });
        useAnswerStore.setState({ submissions: [] });
        useQuestionStore.setState({ currentQuestion: activeQuestion, currentOptions: activeOptions, questions: loadedQuestions });
        useUiStore.setState({ loading: false });

        if (isReused) {
          const existingPartsRes = await ParticipantService.getParticipants(sessionData.id);
          const existingParts = existingPartsRes.data;
          if (existingParts) {
            useParticipantStore.setState({ participants: existingParts as Participant[] });
          }

          const existingAnswersRes = await AnswerService.getAnswersForSession(sessionData.id);
          const existingAnswers = existingAnswersRes.data;
          if (existingAnswers) {
            const mappedAnswers: Answer[] = existingAnswers.map((d: any) => {
              const { participants, ...answer } = d;
              return answer as Answer;
            });
            useAnswerStore.setState({ submissions: mappedAnswers });
          }
        }

        return quizData?.pin_code || null;
      } catch (err) {
        console.error('Error creating quiz session:', err);
        useUiStore.setState({ loading: false });
        return null;
      }
    };

    creationPromise = performCreate().finally(() => {
      creationPromise = null;
    });

    return creationPromise;
  },

  startQuiz: async () => {
    const session = useSessionStore.getState().activeSession;
    if (!session) return;

    const updated: QuizSession = {
      ...session,
      status: 'active',
      current_stage: 'countdown',
      current_question_index: 0,
    };

    await updateSessionStage(
      session.id,
      { status: 'active', current_stage: 'countdown', current_question_index: 0 },
      updated
    );
  },

  nextQuestion: async () => {
    await refreshAuth();

    const session = useSessionStore.getState().activeSession;
    if (!session) {
      throw new Error('Sesi kuis tidak aktif atau tidak ditemukan.');
    }

    let questions = useQuestionStore.getState().questions;
    const isMock = checkIsMock();

    if (!isMock && (!questions || questions.length === 0)) {
      console.log('nextQuestion: Questions array empty in store. Fetching fallback from database...');
      try {
        const res = await QuestionService.getQuestions(session.quiz_id);
        const questionsData = res.success ? res.data : null;

        if (questionsData && questionsData.length > 0) {
          useQuestionStore.setState({ questions: questionsData as Question[] });
          questions = questionsData as Question[];
        }
      } catch (err) {
        console.error('nextQuestion fallback questions fetch error:', err);
      }
    }

    if (!questions || !questions.length) {
      console.warn('nextQuestion called but questions array is still empty. session =', session);
      throw new Error('Gagal memuat daftar soal kuis dari database.');
    }

    const nextIndex = session.current_question_index + 1;
    if (nextIndex >= questions.length) {
      await sessionActions.endQuiz();
      return;
    }

    const nextQuestion = questions[nextIndex];

    let options: Option[] = [];
    if (isMock) {
      const mockOpts = localStorage.getItem(`options_${nextQuestion.id}`);
      options = mockOpts ? JSON.parse(mockOpts) : [];
    } else {
      const res = await QuestionService.getQuestionOptions(nextQuestion.id);
      options = res.success && res.data ? res.data : [];
    }

    const updatedSession: QuizSession = {
      ...session,
      current_question_index: nextIndex,
      current_stage: 'countdown',
    };

    useQuestionStore.setState({
      currentQuestion: nextQuestion,
      currentOptions: options,
    });
    useAnswerStore.setState({ submissions: [] });

    await updateSessionStage(
      session.id,
      { current_question_index: nextIndex, current_stage: 'countdown' },
      updatedSession
    );
  },

  showLeaderboard: async () => {
    const session = useSessionStore.getState().activeSession;
    if (!session) return;

    const updated: QuizSession = { ...session, current_stage: 'leaderboard' };
    await updateSessionStage(
      session.id,
      { current_stage: 'leaderboard' },
      updated
    );
  },

  publishQuestionStage: async () => {
    const session = useSessionStore.getState().activeSession;
    const currentQuestion = useQuestionStore.getState().currentQuestion;
    const options = useQuestionStore.getState().currentOptions;
    if (!session || !currentQuestion) return;

    await refreshAuth();
    const isMock = checkIsMock();
    const now = new Date();
    const quiz = useSessionStore.getState().quiz;
    const durationSeconds = quiz?.duration_per_question || 30;
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    const updatedSession: QuizSession = {
      ...session,
      current_stage: 'question',
      question_started_at: now.toISOString(),
      question_expires_at: expiresAt.toISOString(),
    };

    if (isMock) {
      localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
      useSessionStore.setState({ activeSession: updatedSession });

      const intervals: number[] = [];
      const participants = useParticipantStore.getState().participants;
      participants.forEach((part, pIdx) => {
        const delay = 2000 + Math.random() * 8000;
        const timeoutId = window.setTimeout(() => {
          if (useSessionStore.getState().activeSession?.current_question_index !== session.current_question_index) return;
          if (useSessionStore.getState().activeSession?.current_stage !== 'question') return;

          const correctOpt = options.find(o => o.is_correct) || options[0];
          const incorrectOpts = options.filter(o => !o.is_correct);
          const pickedOption = (Math.random() > 0.35 || incorrectOpts.length === 0)
            ? correctOpt
            : incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)];

          if (!pickedOption) return;

          const isCorrect = pickedOption.is_correct;
          const timeTaken = Math.round(delay);
          const maxSeconds = useSessionStore.getState().quiz?.duration_per_question || 30;
          const timeRatio = Math.min(timeTaken / (maxSeconds * 1000), 1);
          const scoreAwarded = isCorrect
            ? Math.round(currentQuestion.points * (1 - timeRatio * 0.5))
            : 0;

          const mockAnswer: Answer = {
            id: `ans-mock-${pIdx}-${session.current_question_index}`,
            participant_id: part.id,
            question_id: currentQuestion.id,
            selected_option_id: pickedOption.id,
            is_correct: isCorrect,
            response_time_ms: timeTaken,
            score_awarded: scoreAwarded,
            answered_at: new Date().toISOString(),
          };

          const updatedParticipants = useParticipantStore.getState().participants.map(p => {
            if (p.id === part.id) {
              return { ...p, score: p.score + scoreAwarded };
            }
            return p;
          });

          localStorage.setItem(`participants_${session.id}`, JSON.stringify(updatedParticipants));

          const currentSubmissions = useAnswerStore.getState().submissions;
          const newAnswers = [...currentSubmissions, mockAnswer];
          localStorage.setItem(`answers_${session.id}`, JSON.stringify(newAnswers));

          useAnswerStore.setState({ submissions: newAnswers });
          useParticipantStore.setState({ participants: updatedParticipants });
        }, delay);

        intervals.push(timeoutId);
      });

      useSessionStore.setState({ virtualStudentIntervals: intervals });
    } else {
      await updateSessionStage(
        session.id,
        {
          current_stage: 'question',
          question_started_at: now.toISOString(),
          question_expires_at: expiresAt.toISOString(),
        },
        updatedSession
      );
    }
  },

  endQuiz: async () => {
    const session = useSessionStore.getState().activeSession;
    if (!session) return;

    const now = new Date().toISOString();
    const updated: QuizSession = {
      ...session,
      status: 'completed',
      current_stage: 'finished',
      completed_at: now,
    };

    await updateSessionStage(
      session.id,
      { status: 'completed', current_stage: 'finished', completed_at: now },
      updated,
      { currentQuestion: null }
    );

    if (!checkIsMock()) {
      sessionActions.unsubscribeAll();
    }
  },

  revealAnswer: async () => {
    const session = useSessionStore.getState().activeSession;
    if (!session) return;

    const now = new Date().toISOString();
    const updated: QuizSession = {
      ...session,
      current_stage: 'question_result',
      question_expires_at: now,
    };

    await updateSessionStage(
      session.id,
      { current_stage: 'question_result', question_expires_at: now },
      updated
    );
  },

  clearSession: () => {
    sessionActions.unsubscribeAll();
    useSessionStore.getState().virtualStudentIntervals.forEach(id => window.clearTimeout(id));
    useSessionStore.getState().resetSessionStore();
    useQuestionStore.getState().resetQuestionStore();
    useParticipantStore.getState().resetParticipantStore();
    useAnswerStore.getState().resetAnswerStore();
    useUiStore.getState().resetUiStore();
  },

  subscribeToLobby: (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    RealtimeManager.connectAsHost(sessionId);

    const unsubJoined = realtimeEvents.on('ParticipantJoined', (newPart: Participant) => {
      const current = useParticipantStore.getState().participants;
      if (current.some(p => p.id === newPart.id)) return;
      useParticipantStore.setState({ participants: [...current, newPart] });
    });

    const unsubUpdated = realtimeEvents.on('ParticipantUpdated', (updatedPart: Participant) => {
      const current = useParticipantStore.getState().participants;
      useParticipantStore.setState({
        participants: current.map(p => p.id === updatedPart.id ? updatedPart : p)
      });
    });

    const unsubLeft = realtimeEvents.on('ParticipantLeft', (leftPart: Participant) => {
      const current = useParticipantStore.getState().participants;
      useParticipantStore.setState({
        participants: current.filter(p => p.id !== leftPart.id)
      });
    });

    realtimeUnsubs.push(unsubJoined, unsubUpdated, unsubLeft);
  },

  subscribeToAnswers: (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    RealtimeManager.connectAsHost(sessionId);

    const unsub = realtimeEvents.on('AnswerSubmitted', (newAns: Answer) => {
      const currentQuestion = useQuestionStore.getState().currentQuestion;
      if (!currentQuestion || newAns.question_id !== currentQuestion.id) return;

      const participants = useParticipantStore.getState().participants;
      const isParticipant = participants.some(p => p.id === newAns.participant_id);
      if (!isParticipant) return;

      const submissions = useAnswerStore.getState().submissions;
      if (submissions.some(s => s.id === newAns.id)) return;
      useAnswerStore.setState({ submissions: [...submissions, newAns] });
    });
    realtimeUnsubs.push(unsub);
  },

  subscribeToSession: (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    RealtimeManager.connectAsHost(sessionId);

    RealtimeManager.onStatusChange((status) => {
      useSessionStore.setState({ realtimeStatus: status });
    });

    const unsub = realtimeEvents.on('SessionUpdated', async (updatedSess: QuizSession) => {
      if (updatedSess.id !== sessionId) return;

      const currentQuestion = useQuestionStore.getState().currentQuestion;
      const questions = useQuestionStore.getState().questions;
      let activeQuestion = currentQuestion;
      let activeOptions = useQuestionStore.getState().currentOptions;

      if (updatedSess.current_question_index >= 0) {
        const activeSession = useSessionStore.getState().activeSession;
        const indexChanged = !currentQuestion || activeSession?.current_question_index !== updatedSess.current_question_index;
        if (indexChanged && questions[updatedSess.current_question_index]) {
          activeQuestion = questions[updatedSess.current_question_index];
          const optsRes = await QuestionService.getQuestionOptions(activeQuestion.id);
          activeOptions = optsRes.success && optsRes.data ? optsRes.data : [];
        }
      }

      useSessionStore.setState({ activeSession: updatedSess });
      useQuestionStore.setState({
        currentQuestion: activeQuestion,
        currentOptions: activeOptions,
      });
    });
    realtimeUnsubs.push(unsub);
  },

  unsubscribeAll: () => {
    RealtimeManager.disconnect();
    realtimeUnsubs.forEach(unsub => {
      try { unsub(); } catch (_) {}
    });
    realtimeUnsubs = [];
  },

  fetchParticipants: async (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    await refreshAuth();
    try {
      const res = await ParticipantService.getParticipants(sessionId);
      const data = res.data;
      if (res.success && data) {
        const currentParticipants = useParticipantStore.getState().participants;
        const currentSig = currentParticipants.map((p: Participant) => `${p.id}:${p.score}:${p.display_name}`).sort().join(',');
        const newSig = data.map((p: Participant) => `${p.id}:${p.score}:${p.display_name}`).sort().join(',');
        if (currentSig !== newSig) {
          useParticipantStore.setState({ participants: data as Participant[] });
        }
      }
    } catch (err) {
      console.error('Error fetching participants:', err);
    }
  },

  fetchAnswers: async (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    const currentQuestion = useQuestionStore.getState().currentQuestion;
    if (!currentQuestion) return;

    await refreshAuth();
    try {
      const res = await AnswerService.getAnswersForQuestion(sessionId, currentQuestion.id);
      const data = res.data;
      if (res.success && data) {
        const mappedAnswers: Answer[] = data.map((d: any) => {
          const { participants, ...answer } = d;
          return answer as Answer;
        });

        const currentSubmissions = useAnswerStore.getState().submissions;
        const currentIds = currentSubmissions.map(s => s.id).sort().join(',');
        const newIds = mappedAnswers.map(s => s.id).sort().join(',');
        if (currentIds !== newIds) {
          useAnswerStore.setState({ submissions: mappedAnswers });
        }
      }
    } catch (err) {
      console.error('Error fetching answers:', err);
    }
  },

  joinSession: async (pinCode: string, displayName: string, studentId?: string): Promise<boolean> => {
    if (joinPromise) {
      console.log('usePlayStore: joinSession is already in progress, returning existing promise');
      return joinPromise;
    }

    const performJoin = async () => {
      useUiStore.setState({ loading: true, error: null });
      const isMock = checkIsMock();

      if (isMock) {
        const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
        const targetQuiz = allQuizzes.find(q => q.pin_code === pinCode);

        if (!targetQuiz) {
          useUiStore.setState({ error: 'Kode PIN kuis tidak ditemukan.', loading: false });
          return false;
        }

        let activeSession: QuizSession | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('session_')) {
            const sess = JSON.parse(localStorage.getItem(key)!) as QuizSession;
            if (sess.quiz_id === targetQuiz.id && sess.status !== 'completed') {
              activeSession = sess;
              break;
            }
          }
        }

        if (!activeSession) {
          useUiStore.setState({ error: 'Kuis belum dimulai atau tidak aktif.', loading: false });
          return false;
        }

        const key = `participants_${activeSession.id}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        let partData = existing.find((p: any) => p.display_name === displayName);

        if (!partData) {
          partData = {
            id: `p-student-mock-${Date.now()}`,
            session_id: activeSession.id,
            student_id: studentId || null,
            display_name: displayName,
            score: 0,
            lives: targetQuiz.lives_count !== undefined ? targetQuiz.lives_count : 3,
            skipped_questions: [],
            question_status: {},
            current_progress: 0,
            violation_count: 0,
            is_completed: false,
            joined_at: new Date().toISOString(),
          };
          localStorage.setItem(key, JSON.stringify([...existing, partData]));
        }

        const rawQs = JSON.parse(localStorage.getItem(`questions_${targetQuiz.id}`) || '[]');
        const answersKey = `answers_${activeSession.id}`;
        const existingAnswers = JSON.parse(localStorage.getItem(answersKey) || '[]');
        const partAnswers = existingAnswers.filter((a: any) => a.participant_id === partData.id);
        const map: Record<string, Answer> = {};
        partAnswers.forEach((a: any) => {
          map[a.question_id] = a;
        });

        useSessionStore.setState({ session: activeSession, quiz: targetQuiz });
        useParticipantStore.setState({ participant: partData, lives: partData.lives !== undefined ? partData.lives : (targetQuiz?.lives_count !== undefined ? targetQuiz.lives_count : 3) });
        useQuestionStore.setState({ questions: rawQs, currentQuestionIndex: partData.current_progress || 0 });
        useAnswerStore.setState({
          skippedQuestions: partData.skipped_questions || [],
          questionStatus: partData.question_status || {},
          answersMap: map,
          isCompleted: partData.is_completed || false,
          questionStartedAt: Date.now()
        });
        useUiStore.setState({ loading: false });

        if (rawQs.length > 0) {
          const activeIdx = partData.current_progress || 0;
          const activeQ = rawQs[activeIdx];
          if (activeQ) {
            const activeOpts = JSON.parse(localStorage.getItem(`options_${activeQ.id}`) || '[]');
            const hasAns = !!map[activeQ.id];
            useQuestionStore.setState({ currentQuestion: activeQ, currentOptions: activeOpts });
            useAnswerStore.setState({
              hasAnswered: hasAns,
              isAnswerCorrect: hasAns ? map[activeQ.id].is_correct : null,
              scoreAwarded: hasAns ? map[activeQ.id].score_awarded : 0,
            });
          }
        }
        AnalyticsService.trackEvent('join_quiz', { pinCode, displayName, isMock: true });
        return true;
      }

      try {
        await refreshAuth();
        try {
          const startFetch = Date.now();
          const res = await fetch(supabaseUrl + '/rest/v1/', { method: 'GET' });
          const serverDateHeader = res.headers.get('date');
          if (serverDateHeader) {
            const serverTime = new Date(serverDateHeader).getTime();
            const roundTrip = Date.now() - startFetch;
            const adjustedServerTime = serverTime + roundTrip / 2;
            useSessionStore.setState({ serverTimeOffset: Date.now() - adjustedServerTime });
            console.log('play-store clock drift measured:', Date.now() - adjustedServerTime, 'ms');
          }
        } catch (e) {
          console.warn('Failed to calculate server clock offset:', e);
        }

        let quizRes = await QuizService.getQuizByPin(pinCode);
        let quizData = quizRes.data;

        if (!quizRes.success || !quizData) {
          console.log('joinSession: Quiz not found on first try, retrying in 1s...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryRes = await QuizService.getQuizByPin(pinCode);
          quizData = retryRes.data;
        }

        if (!quizData) {
          useUiStore.setState({ error: 'Kode PIN kuis tidak ditemukan.', loading: false });
          return false;
        }

        let sessionRes = await SessionService.getLatestActiveSession(quizData.id);
        let sessionData = sessionRes.data;

        if (!sessionRes.success || !sessionData) {
          console.log('joinSession: Session not found on first try, retrying in 1s...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retrySess = await SessionService.getLatestActiveSession(quizData.id);
          sessionData = retrySess.data;
        }

        if (!sessionData) {
          useUiStore.setState({ error: 'Kuis belum aktif atau sudah selesai.', loading: false });
          return false;
        }

        const existingPartRes = await ParticipantService.getParticipantBySessionAndName(sessionData.id, displayName);
        let partData = existingPartRes.success ? existingPartRes.data : null;

        if (!partData) {
          const insertPayload = {
            session_id: sessionData.id,
            student_id: studentId || null,
            display_name: displayName,
            score: 0,
            lives: quizData.lives_count !== undefined ? quizData.lives_count : 3,
            skipped_questions: [],
            question_status: {},
            current_progress: 0,
            violation_count: 0,
            is_completed: false,
          };

          let joinRes = await ParticipantService.joinParticipant(insertPayload);
          let newPart = joinRes.data;
          let partErr = joinRes.error;

          if (partErr && studentId) {
            console.warn('Failed to insert participant with student_id, retrying without student_id:', partErr);
            const retryJoinRes = await ParticipantService.joinParticipant({
              ...insertPayload,
              student_id: null,
            });
            newPart = retryJoinRes.data;
            partErr = retryJoinRes.error;
          }

          if (partErr || !newPart) {
            const isUniqueViolation = partErr && partErr.code === '23505';
            useUiStore.setState({
              error: isUniqueViolation
                ? 'Nama tampilan sudah digunakan di lobby ini.'
                : `Gagal bergabung: ${partErr?.message || 'Unknown error'}`,
              loading: false
            });
            return false;
          }
          partData = newPart;
        } else {
          if (partData.student_id !== studentId && studentId) {
            const updateRes = await ParticipantService.updateParticipant(partData.id, { student_id: studentId });
            if (updateRes.success && updateRes.data) {
              partData = updateRes.data;
            }
          }
        }

        const questionsRes = await QuestionService.getQuestions(sessionData.quiz_id);
        const loadedQs = questionsRes.success && questionsRes.data ? questionsRes.data : [];

        const answersRes = await AnswerService.getParticipantAnswers(partData.id);
        const answersData = answersRes.success ? answersRes.data : [];

        const map: Record<string, Answer> = {};
        if (answersData) {
          answersData.forEach((a: any) => {
            map[a.question_id] = a as Answer;
          });
        }

        useSessionStore.setState({ session: sessionData as QuizSession, quiz: quizData as Quiz });
        useParticipantStore.setState({ participant: partData as Participant, lives: partData.lives !== undefined && partData.lives !== null ? partData.lives : (quizData?.lives_count !== undefined ? quizData.lives_count : 3) });
        useQuestionStore.setState({ questions: loadedQs, currentQuestionIndex: sessionData.current_question_index >= 0 ? sessionData.current_question_index : 0 });
        useAnswerStore.setState({
          skippedQuestions: partData.skipped_questions || [],
          questionStatus: partData.question_status || {},
          answersMap: map,
          isCompleted: partData.is_completed || false,
          questionStartedAt: Date.now()
        });
        useUiStore.setState({ loading: false });

        if (loadedQs.length > 0) {
          const activeIdx = sessionData.current_question_index >= 0 ? sessionData.current_question_index : 0;
          const activeQ = loadedQs[activeIdx];
          if (activeQ) {
            const options = await fetchOptionsById(activeQ.id);
            const hasAns = !!map[activeQ.id];
            useQuestionStore.setState({ currentQuestion: activeQ, currentOptions: options });
            useAnswerStore.setState({
              hasAnswered: hasAns,
              isAnswerCorrect: hasAns ? map[activeQ.id].is_correct : null,
              scoreAwarded: hasAns ? map[activeQ.id].score_awarded : 0,
            });
          }
        }

        console.log('[SYNC] PlayStore.joinSession: Starting realtime listener for session', sessionData.id);
        sessionActions.listenToSession(sessionData.id);
        AnalyticsService.trackEvent('join_quiz', { pinCode, displayName, isMock: false, sessionId: sessionData.id });
        return true;
      } catch (err) {
        console.error('Error joining session:', err);
        useUiStore.setState({ error: 'Terjadi kesalahan sistem saat mencoba bergabung.', loading: false });
        return false;
      }
    };

    joinPromise = performJoin().finally(() => {
      joinPromise = null;
    });

    return joinPromise;
  },

  listenToSession: (sessionId: string) => {
    const isMock = checkIsMock();
    if (isMock) return;

    sessionActions.stopListening();

    const participant = useParticipantStore.getState().participant;
    if (!participant) return;

    RealtimeManager.connectAsStudent(sessionId, participant.id);

    RealtimeManager.onStatusChange((status) => {
      useSessionStore.setState({ realtimeStatus: status });
    });

    const unsubSess = realtimeEvents.on('SessionUpdated', async (updatedSess: QuizSession) => {
      if (updatedSess.id !== sessionId) return;

      const currentSession = useSessionStore.getState().session;
      const isStageChanged = !currentSession || currentSession.current_stage !== updatedSess.current_stage;
      const isIndexChanged = !currentSession || currentSession.current_question_index !== updatedSess.current_question_index;

      useSessionStore.setState({ session: updatedSess });

      if (isStageChanged || isIndexChanged) {
        await sessionActions.handleSessionUpdate(updatedSess);
      }
    });

    const unsubPart = realtimeEvents.on('ParticipantUpdated', (updatedPart: Participant) => {
      const participant = useParticipantStore.getState().participant;
      if (participant && updatedPart.id === participant.id) {
        useParticipantStore.setState({
          participant: updatedPart,
          lives: updatedPart.lives !== undefined ? updatedPart.lives : useParticipantStore.getState().lives
        });
        useAnswerStore.setState({
          skippedQuestions: updatedPart.skipped_questions || [],
          questionStatus: updatedPart.question_status || {},
          isCompleted: updatedPart.is_completed || false,
        });
      }
    });

    realtimeUnsubs.push(unsubSess, unsubPart);
  },

  stopListening: () => {
    RealtimeManager.disconnect();
    realtimeUnsubs.forEach(unsub => {
      try { unsub(); } catch (_) {}
    });
    realtimeUnsubs = [];
  },

  leaveSession: () => {
    sessionActions.stopListening();
    useSessionStore.getState().resetSessionStore();
    useQuestionStore.getState().resetQuestionStore();
    useParticipantStore.getState().resetParticipantStore();
    useAnswerStore.getState().resetAnswerStore();
    useUiStore.getState().resetUiStore();
  },

  handleSessionUpdate: async (updatedSess: QuizSession) => {
    const questions = useQuestionStore.getState().questions;
    const answersMap = useAnswerStore.getState().answersMap;
    const activeIdx = updatedSess.current_question_index;

    if (activeIdx >= 0 && questions[activeIdx]) {
      const nextQ = questions[activeIdx];
      const opts = await fetchOptionsById(nextQ.id);
      const hasAns = !!answersMap[nextQ.id];

      useQuestionStore.setState({
        currentQuestionIndex: activeIdx,
        currentQuestion: nextQ,
        currentOptions: opts,
      });

      useAnswerStore.setState({
        hasAnswered: hasAns,
        isAnswerCorrect: hasAns ? answersMap[nextQ.id].is_correct : null,
        scoreAwarded: hasAns ? answersMap[nextQ.id].score_awarded : 0,
        questionStartedAt: Date.now()
      });
    } else {
      useQuestionStore.setState({
        currentQuestion: null,
        currentOptions: [],
      });
      useAnswerStore.setState({
        hasAnswered: false,
        isAnswerCorrect: null,
        scoreAwarded: 0,
      });
    }
  }
};
