import { create } from 'zustand';
import type { Participant, QuizSession, Question, Option, Answer, Quiz } from '../types';
import { checkIsMock } from './auth-store';
import { AuthService } from '../services/auth.service';
import { QuizService } from '../services/quiz.service';
import { QuestionService } from '../services/question.service';
import { SessionService } from '../services/session.service';
import { ParticipantService } from '../services/participant.service';
import { AnswerService } from '../services/answer.service';
import { RealtimeManager } from '../realtime/realtime-manager';
import { realtimeEvents } from '../realtime/realtime-events';

// ponytail: shared helpers to kill duplicate code across stage transitions

/** Swallow auth refresh errors — we just want to keep the token alive */
const refreshAuth = async () => { await AuthService.refreshSession(); };

/**
 * Update quiz_sessions in DB then set local state.
 * ponytail: one function replaces 5 near-identical DB→set patterns.
 */
async function updateSessionStage(
  sessionId: string,
  updates: Partial<QuizSession>,
  fullSession: QuizSession,
  setFn: (s: Partial<any>) => void,
  extraLocalState?: Partial<any>,
): Promise<void> {
  const isMock = checkIsMock();
  if (isMock) {
    localStorage.setItem(`session_${sessionId}`, JSON.stringify(fullSession));
    setFn({ activeSession: fullSession, ...extraLocalState });
    return;
  }
  await refreshAuth();
  console.log('[SYNC] HostStore: Updating DB with', updates);
  const res = await SessionService.updateSession(sessionId, updates);
  if (!res.success) throw res.error;
  console.log('[SYNC] HostStore: DB updated. Setting local state...');
  setFn({ activeSession: fullSession, ...extraLocalState });
}

interface HostState {
  questions: Question[];
  activeSession: QuizSession | null;
  quiz: Quiz | null;
  participants: Participant[];
  currentQuestion: Question | null;
  currentOptions: Option[];
  submissions: Answer[];
  loading: boolean;
  virtualStudentIntervals: number[];

  createSession: (quizId: string) => Promise<string | null>; // Returns PIN
  startQuiz: () => Promise<void>;
  nextQuestion: () => Promise<void>;
  showLeaderboard: () => Promise<void>;
  publishQuestionStage: () => Promise<void>;
  endQuiz: () => Promise<void>;
  revealAnswer: () => Promise<void>;
  clearSession: () => void;
  fetchQuestions: (quizId: string) => Promise<Question[]>;

  subscribeToLobby: (sessionId: string) => void;
  subscribeToAnswers: (sessionId: string) => void;
  subscribeToSession: (sessionId: string) => void;
  unsubscribeAll: () => void;
  fetchParticipants: (sessionId: string) => Promise<void>;
  fetchAnswers: (sessionId: string) => Promise<void>;
}

export const useHostStore = create<HostState>((set, get) => {
  let realtimeUnsubs: (() => void)[] = [];
  let creationPromise: Promise<string | null> | null = null;

  // Mock list of students to simulate real-time joining in offline demo
  const VIRTUAL_NAMES = ['Budi Santoso', 'Ani Wijaya', 'Dedi Kurniawan', 'Siti Rahma', 'Joko Susilo', 'Rini Astuti'];

  return {
    questions: [],
    activeSession: null,
    quiz: null,
    participants: [],
    currentQuestion: null,
    currentOptions: [],
    submissions: [],
    loading: false,
    virtualStudentIntervals: [],

    createSession: async (quizId: string) => {
      if (creationPromise) {
        console.log('useHostStore: createSession is already in progress, returning existing promise');
        return creationPromise;
      }

      const performCreate = async () => {
        set({ loading: true });
        const isMock = checkIsMock();
        const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

        if (isMock) {
          const rawQs = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
          const allQuizzes = JSON.parse(localStorage.getItem('quizzes') || '[]');
          const targetQuiz = allQuizzes.find((q: any) => q.id === quizId);

          // Mock session
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

          // Cache session
          localStorage.setItem(`session_${newSession.id}`, JSON.stringify(newSession));
          localStorage.setItem(`participants_${newSession.id}`, JSON.stringify([]));
          localStorage.setItem(`answers_${newSession.id}`, JSON.stringify([]));

          set({
            activeSession: newSession,
            quiz: targetQuiz || null,
            participants: [],
            submissions: [],
            currentQuestion: null,
            currentOptions: [],
            loading: false,
            questions: rawQs,
          });

          // Simulate virtual students joining after a few seconds
          const intervals: number[] = [];
          VIRTUAL_NAMES.forEach((name, idx) => {
            const timeoutId = window.setTimeout(() => {
              if (get().activeSession?.status === 'lobby') {
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
                const updated = [...get().participants, newParticipant];
                localStorage.setItem(`participants_${newSession.id}`, JSON.stringify(updated));
                set({ participants: updated });
              }
            }, (idx + 1) * 2000);
            intervals.push(timeoutId);
          });

          set({ virtualStudentIntervals: intervals });
          return pinCode;
        }

        // Supabase Flow
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
            
            // Clean up other duplicate sessions if any
            if (existingSessions.length > 1) {
              const staleIds = existingSessions.slice(1).map(s => s.id);
              await SessionService.terminateSessionsByIds(staleIds);
            }
          } else {
            // Clean up any other active/lobby sessions of this quiz to avoid conflicts
            await SessionService.terminateSessions(quizId);

            // Create quiz session
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

          // Fetch questions
          const loadedQuestions = await get().fetchQuestions(quizId);

          // Load active question and options if session is already active
          let activeQuestion = null;
          let activeOptions: Option[] = [];
          if (sessionData.status === 'active' && sessionData.current_question_index >= 0) {
            if (loadedQuestions[sessionData.current_question_index]) {
              activeQuestion = loadedQuestions[sessionData.current_question_index];
              const optionsRes = await QuestionService.getQuestionOptions(activeQuestion.id);
              activeOptions = optionsRes.success && optionsRes.data ? optionsRes.data : [];
            }
          }

          set({
            activeSession: sessionData as QuizSession,
            participants: [],
            submissions: [],
            currentQuestion: activeQuestion,
            currentOptions: activeOptions,
            loading: false,
            questions: loadedQuestions,
          });

          if (quizData) {
            set({ quiz: quizData as Quiz });
          }

          // Fetch existing participants and answers if we are reusing a session
          if (isReused) {
            const existingPartsRes = await ParticipantService.getParticipants(sessionData.id);
            const existingParts = existingPartsRes.data;
            if (existingParts) {
              set({ participants: existingParts as Participant[] });
            }

            const existingAnswersRes = await AnswerService.getAnswersForSession(sessionData.id);
            const existingAnswers = existingAnswersRes.data;
            if (existingAnswers) {
              const mappedAnswers: Answer[] = existingAnswers.map((d: any) => {
                const { participants, ...answer } = d;
                return answer as Answer;
              });
              set({ submissions: mappedAnswers });
            }
          }

          return quizData?.pin_code || null;
        } catch (err) {
          console.error('Error creating quiz session:', err);
          set({ loading: false });
          return null;
        }
      };

      creationPromise = performCreate().finally(() => {
        creationPromise = null;
      });

      return creationPromise;
    },

    startQuiz: async () => {
      const session = get().activeSession;
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
        updated,
        set,
      );
    },

    nextQuestion: async () => {
      // Auto-refresh token if expired
      await refreshAuth();

      const session = get().activeSession;
      if (!session) {
        throw new Error('Sesi kuis tidak aktif atau tidak ditemukan.');
      }

      let questions = get().questions;
      const isMock = checkIsMock();

      if (!isMock && (!questions || questions.length === 0)) {
        console.log('nextQuestion: Questions array empty in store. Fetching fallback from database...');
        try {
          const res = await QuestionService.getQuestions(session.quiz_id);
          const questionsData = res.success ? res.data : null;

          if (questionsData && questionsData.length > 0) {
            set({ questions: questionsData as Question[] });
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
        await get().endQuiz();
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

      set({
        currentQuestion: nextQuestion,
        currentOptions: options,
        submissions: [],
      });

      await updateSessionStage(
        session.id,
        { current_question_index: nextIndex, current_stage: 'countdown' },
        updatedSession,
        set,
      );
    },

    publishQuestionStage: async () => {
      const session = get().activeSession;
      const currentQuestion = get().currentQuestion;
      const options = get().currentOptions;
      if (!session || !currentQuestion) return;

      // Auto-refresh token if expired
      await refreshAuth();

      const isMock = checkIsMock();
      const now = new Date();
      const quiz = get().quiz;
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
        set({ activeSession: updatedSession });

        // Simulate virtual students submitting answers
        const intervals: number[] = [];
        get().participants.forEach((part, pIdx) => {
          const delay = 2000 + Math.random() * 8000; // random delay to answer
          const timeoutId = window.setTimeout(() => {
            // Prevent submitting if question changed or timer expired
            if (get().activeSession?.current_question_index !== session.current_question_index) return;
            if (get().activeSession?.current_stage !== 'question') return;

            // Pick an option (mostly correct, some incorrect to make leaderboard fun)
            const correctOpt = options.find(o => o.is_correct) || options[0];
            const incorrectOpts = options.filter(o => !o.is_correct);
            const pickedOption = (Math.random() > 0.35 || incorrectOpts.length === 0) 
              ? correctOpt 
              : incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)];

            if (!pickedOption) return;

            const isCorrect = pickedOption.is_correct;
            const timeTaken = Math.round(delay);
            // Auto scoring formula: Kahoot style (max points reduced by time taken)
            const maxSeconds = get().quiz?.duration_per_question || 30;
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

            // Update participant total score in local state and localStorage
            const updatedParticipants = get().participants.map(p => {
              if (p.id === part.id) {
                return { ...p, score: p.score + scoreAwarded };
              }
              return p;
            });

            localStorage.setItem(`participants_${session.id}`, JSON.stringify(updatedParticipants));
            
            const newAnswers = [...get().submissions, mockAnswer];
            localStorage.setItem(`answers_${session.id}`, JSON.stringify(newAnswers));

            set({
              submissions: newAnswers,
              participants: updatedParticipants
            });
          }, delay);

          intervals.push(timeoutId);
        });

        set({ virtualStudentIntervals: intervals });
      } else {
        await updateSessionStage(
          session.id,
          {
            current_stage: 'question',
            question_started_at: now.toISOString(),
            question_expires_at: expiresAt.toISOString(),
          },
          updatedSession,
          set,
        );
      }
    },

    showLeaderboard: async () => {
      const session = get().activeSession;
      if (!session) return;

      const updated: QuizSession = { ...session, current_stage: 'leaderboard' };
      await updateSessionStage(
        session.id,
        { current_stage: 'leaderboard' },
        updated,
        set,
      );
    },

    endQuiz: async () => {
      const session = get().activeSession;
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
        set,
        { currentQuestion: null },
      );

      if (!checkIsMock()) {
        get().unsubscribeAll();
      }
    },

    revealAnswer: async () => {
      const session = get().activeSession;
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
        updated,
        set,
      );
    },

    clearSession: () => {
      get().unsubscribeAll();
      get().virtualStudentIntervals.forEach(id => window.clearTimeout(id));
      set({
        activeSession: null,
        quiz: null,
        participants: [],
        questions: [],
        currentQuestion: null,
        currentOptions: [],
        submissions: [],
        virtualStudentIntervals: [],
      });
    },

    fetchQuestions: async (quizId: string) => {
      const isMock = checkIsMock();
      if (isMock) {
        const rawQs = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
        set({ questions: rawQs });
        return rawQs;
      }
      // Auto-refresh token if expired
      await refreshAuth();

      try {
        const res = await QuestionService.getQuestions(quizId);
        if (res.success && res.data) {
          set({ questions: res.data });
          return res.data;
        }
      } catch (err) {
        console.error('Error in fetchQuestions action:', err);
      }
      return [];
    },

    fetchParticipants: async (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      // Auto-refresh token if expired
      await refreshAuth();

      try {
        const res = await ParticipantService.getParticipants(sessionId);
        const data = res.data;

        if (res.success && data) {
          // Only update if the length changed or data is different, to avoid unnecessary re-renders
          set(state => {
            const currentSig = state.participants.map((p: Participant) => `${p.id}:${p.score}:${p.display_name}`).sort().join(',');
            const newSig = data.map((p: Participant) => `${p.id}:${p.score}:${p.display_name}`).sort().join(',');
            if (currentSig === newSig) return state;
            return { participants: data as Participant[] };
          });
        }
      } catch (err) {
        console.error('Error fetching participants:', err);
      }
    },

    fetchAnswers: async (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      const currentQuestion = get().currentQuestion;
      if (!currentQuestion) return;

      // Auto-refresh token if expired
      await refreshAuth();

      try {
        const res = await AnswerService.getAnswersForQuestion(sessionId, currentQuestion.id);
        const data = res.data;

        if (res.success && data) {
          const mappedAnswers: Answer[] = data.map((d: any) => {
            const { participants, ...answer } = d;
            return answer as Answer;
          });

          set(state => {
            const currentIds = state.submissions.map(s => s.id).sort().join(',');
            const newIds = mappedAnswers.map(s => s.id).sort().join(',');
            if (currentIds === newIds) return state;
            return { submissions: mappedAnswers };
          });
        }
      } catch (err) {
        console.error('Error fetching answers:', err);
      }
    },

    subscribeToLobby: (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      RealtimeManager.connectAsHost(sessionId);

      const unsub = realtimeEvents.on('ParticipantJoined', (newPart: Participant) => {
        set(state => {
          if (state.participants.some(p => p.id === newPart.id)) return state;
          return { participants: [...state.participants, newPart] };
        });
      });
      realtimeUnsubs.push(unsub);
    },

    subscribeToAnswers: (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      RealtimeManager.connectAsHost(sessionId);

      const unsub = realtimeEvents.on('AnswerSubmitted', async (newAns: Answer) => {
        // Verify this answer is for the current question
        const currentQuestion = get().currentQuestion;
        if (!currentQuestion || newAns.question_id !== currentQuestion.id) return;

        // Verify this answer is for one of our active participants
        const isParticipant = get().participants.some(p => p.id === newAns.participant_id);
        if (!isParticipant) return;

        set(state => {
          if (state.submissions.some(s => s.id === newAns.id)) return state;
          return { submissions: [...state.submissions, newAns] };
        });

        // Fetch the participant's details to update their score on the UI
        const partRes = await ParticipantService.getParticipantById(newAns.participant_id);
        const partData = partRes.success ? partRes.data : null;

        if (partData) {
          set(state => ({
            participants: state.participants.map(p => p.id === partData.id ? (partData as Participant) : p)
          }));
        }
      });
      realtimeUnsubs.push(unsub);
    },

    subscribeToSession: (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      RealtimeManager.connectAsHost(sessionId);

      const unsub = realtimeEvents.on('SessionUpdated', async (updatedSess: QuizSession) => {
        if (updatedSess.id !== sessionId) return;

        const currentQuestion = get().currentQuestion;
        const questions = get().questions;
        let activeQuestion = currentQuestion;
        let activeOptions = get().currentOptions;

        if (updatedSess.current_question_index >= 0) {
          const indexChanged = !currentQuestion || get().activeSession?.current_question_index !== updatedSess.current_question_index;
          if (indexChanged && questions[updatedSess.current_question_index]) {
            activeQuestion = questions[updatedSess.current_question_index];
            const optsRes = await QuestionService.getQuestionOptions(activeQuestion.id);
            activeOptions = optsRes.success && optsRes.data ? optsRes.data : [];
          }
        }

        set({
          activeSession: updatedSess,
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
    }
  };
});
