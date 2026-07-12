import { create } from 'zustand';
import type { Participant, QuizSession, Question, Option, Answer, Quiz } from '@/types';
import { checkIsMock } from '@/features/auth/stores/auth-store';
import { AnalyticsService } from '@/shared/services/analytics.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { QuizService } from '@/features/quiz/services/quiz.service';
import { QuestionService } from '@/features/question/services/question.service';
import { SessionService } from '@/features/session/services/session.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { AnswerService } from '@/features/answer/services/answer.service';
import { LeaderboardService } from '@/features/leaderboard/services/leaderboard.service';
import { RealtimeManager } from '@/core/realtime/realtime-manager';
import { realtimeEvents } from '@/core/realtime/realtime-events';
import type { RealtimeStatus } from '@/core/realtime/realtime-types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';

const refreshAuth = async () => { await AuthService.refreshSession(); };

/** Fetch options for a question. Used by joinSession, handleQuestionChange, setQuestionProgress. */
async function fetchOptionsById(questionId: string): Promise<Option[]> {
  if (checkIsMock()) {
    const raw = localStorage.getItem(`options_${questionId}`);
    return raw ? JSON.parse(raw) : [];
  }
  const res = await QuestionService.getQuestionOptions(questionId);
  return res.success && res.data ? res.data : [];
}

interface PlayState {
  session: QuizSession | null;
  quiz: Quiz | null;
  participant: Participant | null;
  currentQuestion: Question | null;
  currentOptions: Option[];
  hasAnswered: boolean;
  isAnswerCorrect: boolean | null;
  scoreAwarded: number;
  loading: boolean;
  error: string | null;
  pollingInterval: number | null;
  serverTimeOffset: number; // localTime - serverTime
  realtimeStatus: RealtimeStatus;

  // Self-paced quiz mode state
  questions: Question[];
  currentQuestionIndex: number;
  lives: number;
  skippedQuestions: string[];
  questionStatus: Record<string, 'unanswered' | 'answered' | 'skipped'>;
  answersMap: Record<string, Answer>;
  isCompleted: boolean;
  questionStartedAt: number;

  joinSession: (pinCode: string, displayName: string, studentId?: string) => Promise<boolean>;
  submitAnswer: (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => Promise<void>;
  listenToSession: (sessionId: string) => void;
  stopListening: () => void;
  leaveSession: () => void;
  handleSessionUpdate: (updatedSess: QuizSession) => Promise<void>;

  // Self-paced quiz actions
  setQuestionProgress: (index: number) => Promise<void>;
  skipQuestion: (questionId: string) => Promise<void>;
  submitSelfPacedAnswer: (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => Promise<void>;
  submitFinalQuiz: () => Promise<void>;
  saveAnswerState: (questionId: string, answerData: { selected_option_id: string | null; selected_option_ids: string[] | null; matching_answers: Record<string, string> | null }) => void;
  fetchLeaderboard: () => Promise<Participant[]>;
  fetchQuestionStats: (questionId: string) => Promise<{ correctCount: number; incorrectCount: number; totalCount: number } | null>;
  incrementViolation: () => Promise<void>;
}

export const usePlayStore = create<PlayState>((set, get) => {
  let realtimeUnsubs: (() => void)[] = [];
  let joinPromise: Promise<boolean> | null = null;

  return {
    session: null,
    quiz: null,
    participant: null,
    currentQuestion: null,
    currentOptions: [],
    hasAnswered: false,
    isAnswerCorrect: null,
    scoreAwarded: 0,
    loading: false,
    error: null,
    pollingInterval: null,
    serverTimeOffset: 0,
    realtimeStatus: 'DISCONNECTED',

    // Self-paced defaults
    questions: [],
    currentQuestionIndex: 0,
    lives: 3,
    skippedQuestions: [],
    questionStatus: {},
    answersMap: {},
    isCompleted: false,
    questionStartedAt: 0,

    joinSession: async (pinCode: string, displayName: string, studentId?: string) => {
      if (joinPromise) {
        console.log('usePlayStore: joinSession is already in progress, returning existing promise');
        return joinPromise;
      }

      const performJoin = async () => {
        set({ loading: true, error: null });
        const isMock = checkIsMock();

        if (isMock) {
          // Mock Flow: Find mock session matching this quiz pin
          const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
          const targetQuiz = allQuizzes.find(q => q.pin_code === pinCode);

          if (!targetQuiz) {
            set({ error: 'Kode PIN kuis tidak ditemukan.', loading: false });
            return false;
          }

          // Find active session
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
            set({ error: 'Kuis belum dimulai atau tidak aktif.', loading: false });
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

          // Preload mock answers
          const answersKey = `answers_${activeSession.id}`;
          const existingAnswers = JSON.parse(localStorage.getItem(answersKey) || '[]');
          const partAnswers = existingAnswers.filter((a: any) => a.participant_id === partData.id);
          const map: Record<string, Answer> = {};
          partAnswers.forEach((a: any) => {
            map[a.question_id] = a;
          });

          set({
            session: activeSession,
            quiz: targetQuiz,
            participant: partData,
            questions: rawQs,
            currentQuestionIndex: partData.current_progress || 0,
            lives: partData.lives !== undefined ? partData.lives : (targetQuiz?.lives_count !== undefined ? targetQuiz.lives_count : 3),
            skippedQuestions: partData.skipped_questions || [],
            questionStatus: partData.question_status || {},
            answersMap: map,
            isCompleted: partData.is_completed || false,
            loading: false,
            questionStartedAt: Date.now()
          });

          if (rawQs.length > 0) {
            const activeIdx = partData.current_progress || 0;
            const activeQ = rawQs[activeIdx];
            if (activeQ) {
              const activeOpts = JSON.parse(localStorage.getItem(`options_${activeQ.id}`) || '[]');
              const hasAns = !!map[activeQ.id];
              set({
                currentQuestion: activeQ,
                currentOptions: activeOpts,
                hasAnswered: hasAns,
                isAnswerCorrect: hasAns ? map[activeQ.id].is_correct : null,
                scoreAwarded: hasAns ? map[activeQ.id].score_awarded : 0,
              });
            }
          }
          AnalyticsService.trackEvent('join_quiz', { pinCode, displayName, isMock: true });
          return true;
        }

        // Supabase Flow
        try {
          // Auto-refresh token if expired
          await refreshAuth();

          // Measure clock drift relative to Supabase API server
          try {
            const startFetch = Date.now();
            const res = await fetch(supabaseUrl + '/rest/v1/', { method: 'GET' });
            const serverDateHeader = res.headers.get('date');
            if (serverDateHeader) {
              const serverTime = new Date(serverDateHeader).getTime();
              // Adjust for half-trip network latency
              const roundTrip = Date.now() - startFetch;
              const adjustedServerTime = serverTime + roundTrip / 2;
              set({ serverTimeOffset: Date.now() - adjustedServerTime });
              console.log('play-store clock drift measured:', Date.now() - adjustedServerTime, 'ms');
            }
          } catch (e) {
            console.warn('Failed to calculate server clock offset:', e);
          }

          // 1. Get quiz by pin
          let quizRes = await QuizService.getQuizByPin(pinCode);
          let quizData = quizRes.data;

          if (!quizRes.success || !quizData) {
            console.log('joinSession: Quiz not found on first try, retrying in 1s...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryRes = await QuizService.getQuizByPin(pinCode);
            quizData = retryRes.data;
          }

          if (!quizData) {
            set({ error: 'Kode PIN kuis tidak ditemukan.', loading: false });
            return false;
          }

          // 2. Get active session
          let sessionRes = await SessionService.getLatestActiveSession(quizData.id);
          let sessionData = sessionRes.data;

          if (!sessionRes.success || !sessionData) {
            console.log('joinSession: Session not found on first try, retrying in 1s...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retrySess = await SessionService.getLatestActiveSession(quizData.id);
            sessionData = retrySess.data;
          }

          if (!sessionData) {
            set({ error: 'Kuis belum aktif atau sudah selesai.', loading: false });
            return false;
          }

          // 3. Check if participant already exists in this session
          const existingPartRes = await ParticipantService.getParticipantBySessionAndName(sessionData.id, displayName);
          let partData = existingPartRes.success ? existingPartRes.data : null;

          if (!partData) {
            // Create participant
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

            // Robust Fallback: If foreign key or other constraint error, retry without student_id
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
              set({ 
                error: isUniqueViolation 
                  ? 'Nama tampilan sudah digunakan di lobby ini.' 
                  : `Gagal bergabung: ${partErr?.message || 'Unknown error'}`, 
                loading: false 
              });
              return false;
            }
            partData = newPart;
          } else {
            // If student_id is set, ensure it matches
            if (studentId && partData.student_id && partData.student_id !== studentId) {
              set({ error: 'Nama tampilan sudah digunakan oleh murid lain.', loading: false });
              return false;
            }
            // Update student_id if it wasn't set
            if (studentId && !partData.student_id) {
              const updateRes = await ParticipantService.updateParticipant(partData.id, { student_id: studentId });
              if (updateRes.success && updateRes.data) {
                partData = updateRes.data;
              }
            }
          }

          // Fetch all questions of the quiz
          const questionsRes = await QuestionService.getQuestions(sessionData.quiz_id);
          const loadedQs = questionsRes.success && questionsRes.data ? questionsRes.data : [];

          // Fetch participant answers
          const answersRes = await AnswerService.getParticipantAnswers(partData.id);
          const answersData = answersRes.success ? answersRes.data : [];
          
          const map: Record<string, Answer> = {};
          if (answersData) {
            answersData.forEach((a: any) => {
              map[a.question_id] = a as Answer;
            });
          }

          set({
            session: sessionData as QuizSession,
            quiz: quizData as Quiz,
            participant: partData as Participant,
            questions: loadedQs,
            currentQuestionIndex: sessionData.current_question_index >= 0 ? sessionData.current_question_index : 0,
            lives: partData.lives !== undefined && partData.lives !== null ? partData.lives : (quizData?.lives_count !== undefined ? quizData.lives_count : 3),
            skippedQuestions: partData.skipped_questions || [],
            questionStatus: partData.question_status || {},
            answersMap: map,
            isCompleted: partData.is_completed || false,
            loading: false,
            questionStartedAt: Date.now()
          });

          // Fetch current question options
          if (loadedQs.length > 0) {
            const activeIdx = sessionData.current_question_index >= 0 ? sessionData.current_question_index : 0;
            const activeQ = loadedQs[activeIdx];
            if (activeQ) {
              const options = await fetchOptionsById(activeQ.id);

              const hasAns = !!map[activeQ.id];
              set({
                currentQuestion: activeQ,
                currentOptions: options,
                hasAnswered: hasAns,
                isAnswerCorrect: hasAns ? map[activeQ.id].is_correct : null,
                scoreAwarded: hasAns ? map[activeQ.id].score_awarded : 0,
              });
            }
          }

          // ponytail: start listening immediately inside joinSession to eliminate gap
          // where Realtime events could be missed between join and useEffect firing
          console.log('[SYNC] PlayStore.joinSession: Starting realtime listener for session', sessionData.id);
          get().listenToSession(sessionData.id);
          AnalyticsService.trackEvent('join_quiz', { pinCode, displayName, isMock: false, sessionId: sessionData.id });
          return true;
        } catch (err) {
          console.error('Error joining session:', err);
          set({ error: 'Terjadi kesalahan sistem saat mencoba bergabung.', loading: false });
          return false;
        }
      };

      joinPromise = performJoin().finally(() => {
        joinPromise = null;
      });

      return joinPromise;
    },

    submitAnswer: async (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session } = get();
      if (!session) return;
      
      // Legacy Realtime Host-paced flow
      const { participant, currentQuestion, currentOptions, hasAnswered } = get();
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

      // Handle Lives in Santai mode
      let newLives = get().lives;
      const initialLives = get().quiz?.lives_count ?? 3;
      if (!isCorrect && session.quiz_mode === 'santai' && initialLives > 0) {
        newLives = Math.max(0, newLives - 1);
      }

      const updatedStatuses = { ...get().questionStatus, [currentQuestion.id]: 'answered' as const };

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

        set({
          participant: updatedPart,
          lives: newLives,
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
          set({
            participant: updatedPart as Participant,
            lives: newLives,
            questionStatus: updatedStatuses,
            hasAnswered: true,
            isAnswerCorrect: isCorrect,
            scoreAwarded,
          });
        }
      } catch (err: any) {
        console.error('Error submitting answer:', err);
        set({
          hasAnswered: false,
          isAnswerCorrect: null,
          scoreAwarded: 0,
        });
      }
    },

    listenToSession: (sessionId: string) => {
      const isMock = checkIsMock();

      // Cleanly terminate any active listeners first to prevent duplicates/leaks
      get().stopListening();

      if (isMock) {
        const intervalId = window.setInterval(() => {
          const sessKey = `session_${sessionId}`;
          const currentSess = JSON.parse(localStorage.getItem(sessKey) || 'null') as QuizSession | null;
          
          if (!currentSess) return;

          const previousSess = get().session;
          const indexChanged = previousSess?.current_question_index !== currentSess.current_question_index;
          const statusChanged = previousSess?.status !== currentSess.status;

          // For self-paced quizzes, we do NOT force student index progression, we only listen to status completion
          const isSelfPaced = currentSess.quiz_mode === 'serius' || currentSess.quiz_mode === 'santai';

          if (statusChanged || (!isSelfPaced && indexChanged)) {
            set({ session: currentSess });

            if (currentSess.status === 'completed') {
              // Finish kuis for this student
              set({ isCompleted: true });
              return;
            }

            // Only load host question index if in legacy host-paced mode
            if (!isSelfPaced && currentSess.current_question_index >= 0) {
              const quizId = currentSess.quiz_id;
              const allQuestions: Question[] = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
              const activeQ = allQuestions[currentSess.current_question_index];
              
              if (activeQ) {
                const activeOpts = JSON.parse(localStorage.getItem(`options_${activeQ.id}`) || '[]');
                set({
                  currentQuestion: activeQ,
                  currentOptions: activeOpts,
                  hasAnswered: false,
                  isAnswerCorrect: null,
                  scoreAwarded: 0,
                });
              }
            }
          }
        }, 1000);

        set({ pollingInterval: intervalId });
        return;
      }

      // Supabase Flow
      RealtimeManager.connectAsStudent(sessionId, get().participant?.id || '');

      RealtimeManager.onStatusChange((status) => {
        set({ realtimeStatus: status });
      });

      const unsubSession = realtimeEvents.on('SessionUpdated', (updatedSess: QuizSession) => {
        if (updatedSess.id !== sessionId) return;
        get().handleSessionUpdate(updatedSess);
      });

      const unsubParticipant = realtimeEvents.on('MyParticipantUpdated', (updatedPart: Participant) => {
        if (updatedPart.id !== get().participant?.id) return;
        set({ participant: updatedPart });
      });

      realtimeUnsubs.push(unsubSession, unsubParticipant);
    },

    stopListening: () => {
      if (get().pollingInterval) {
        window.clearInterval(get().pollingInterval!);
        set({ pollingInterval: null });
      }

      RealtimeManager.disconnect();
      realtimeUnsubs.forEach(unsub => {
        try { unsub(); } catch (_) {}
      });
      realtimeUnsubs = [];
    },

    leaveSession: () => {
      get().stopListening();

      set({
        session: null,
        quiz: null,
        participant: null,
        currentQuestion: null,
        currentOptions: [],
        hasAnswered: false,
        isAnswerCorrect: null,
        scoreAwarded: 0,
        questions: [],
        currentQuestionIndex: 0,
        lives: 3,
        skippedQuestions: [],
        questionStatus: {},
        answersMap: {},
        isCompleted: false,
      });
    },

    handleSessionUpdate: async (updatedSess: QuizSession) => {
      const previousSess = get().session;
      console.log('[SYNC] PlayStore.handleSessionUpdate:', {
        prevStage: previousSess?.current_stage,
        newStage: updatedSess.current_stage,
        prevQIdx: previousSess?.current_question_index,
        newQIdx: updatedSess.current_question_index,
        status: updatedSess.status,
      });

      // ponytail: always update session first — single source of truth
      set({ session: updatedSess });

      // Handle finish
      if (updatedSess.status === 'completed' || updatedSess.current_stage === 'finished') {
        get().stopListening();
        set({ isCompleted: true });
        console.log('[SYNC] PlayStore: Quiz completed/finished');
        return;
      }

      // Handle question index change
      if (updatedSess.current_question_index >= 0) {
        const questionIdxChanged = !previousSess ||
          previousSess.current_question_index !== updatedSess.current_question_index ||
          get().currentQuestion === null;

        if (questionIdxChanged) {
          try {
            // Ensure questions are loaded (only fetch if missing)
            let questions = get().questions;
            if (!questions || questions.length === 0) {
              const qsRes = await QuestionService.getQuestions(updatedSess.quiz_id);
              if (!qsRes.success) throw qsRes.error;
              questions = qsRes.data || [];
              set({ questions });
            }

            const nextQ = questions[updatedSess.current_question_index];
            if (nextQ) {
              const options = await fetchOptionsById(nextQ.id);
              const existingAnswer = get().answersMap[nextQ.id];
              const hasAns = !!existingAnswer;

              set({
                currentQuestionIndex: updatedSess.current_question_index,
                currentQuestion: nextQ,
                currentOptions: options,
                hasAnswered: hasAns,
                isAnswerCorrect: hasAns ? existingAnswer.is_correct : null,
                scoreAwarded: hasAns ? existingAnswer.score_awarded : 0,
              });
            }
          } catch (err) {
            console.error('[SYNC] PlayStore: Error loading question on stage change:', err);
          }
        }
      }

      // Handle force auto-submit on question_result
      if (updatedSess.current_stage === 'question_result') {
        if (!get().hasAnswered && get().currentQuestion) {
          console.log('[SYNC] PlayStore: Auto-submitting unanswered question');
          const qType = get().currentQuestion?.question_type || 'multiple_choice';
          if (qType === 'multiple_answer') {
            await get().submitAnswer({ optionIds: [] });
          } else if (qType === 'matching') {
            await get().submitAnswer({ matchingAnswers: {} });
          } else {
            await get().submitAnswer('');
          }
        }
      }
    },

    // ==========================================
    // NEW SELF-PACED ACTIONS
    // ==========================================

    setQuestionProgress: async (index: number) => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { questions, participant, answersMap, session } = get();
      if (!session || !participant || index < 0 || index >= questions.length) return;

      const activeQ = questions[index];
      const isMock = checkIsMock();

      // Fetch options for the active question
      let options: Option[] = [];
      try {
        options = await fetchOptionsById(activeQ.id);
      } catch (err) {
        console.error('setQuestionProgress failed to fetch options:', err);
        throw new Error('Gagal memuat pilihan jawaban dari server. Harap periksa jaringan Anda.');
      }

      // Check if this question is already answered in the map
      const answeredObj = answersMap[activeQ.id];
      const hasAns = !!answeredObj;

      set({
        currentQuestionIndex: index,
        currentQuestion: activeQ,
        currentOptions: options,
        hasAnswered: hasAns,
        isAnswerCorrect: hasAns ? answeredObj.is_correct : null,
        scoreAwarded: hasAns ? answeredObj.score_awarded : 0,
        questionStartedAt: Date.now() // start question timer
      });

      // Update current_progress on participant record
      const updatedPart = { ...participant, current_progress: index };
      set({ participant: updatedPart });

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
        // Don't throw here to avoid disrupting client gameplay flow if local state updated successfully
      }
    },

    skipQuestion: async (questionId: string) => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session, participant, questionStatus, skippedQuestions, currentQuestionIndex, questions } = get();
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

      set({
        questionStatus: updatedStatuses,
        skippedQuestions: updatedSkipped,
        participant: updatedPart
      });

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

      // Navigate to next question automatically if available, otherwise stay
      if (currentQuestionIndex + 1 < questions.length) {
        await get().setQuestionProgress(currentQuestionIndex + 1);
      }
    },

    submitSelfPacedAnswer: async (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session, participant, currentQuestion, currentOptions, hasAnswered, questionStatus, answersMap, questionStartedAt } = get();
      if (!session || !participant || !currentQuestion || hasAnswered) return;

      const isMock = checkIsMock();
      let isCorrect = false;
      let optionIdToSave: string | null = null;
      let optionIdsToSave: string[] | null = null;
      let matchingAnswersToSave: Record<string, string> | null = null;

      const qType = currentQuestion.question_type || 'multiple_choice';

      if (typeof arg === 'string') {
        const option = currentOptions.find(o => o.id === arg);
        if (!option) return;
        isCorrect = option.is_correct;
        optionIdToSave = arg;
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
          if (!option) return;
          isCorrect = option.is_correct;
          optionIdToSave = optId;
        }
      }

      // Scoring
      const responseTime = Math.max(0, Date.now() - questionStartedAt);
      const scoreAwarded = isCorrect ? currentQuestion.points : 0;

      // Handle Lives in Santai mode
      let newLives = get().lives;
      const initialLives = get().quiz?.lives_count ?? 3;
      if (!isCorrect && session.quiz_mode === 'santai' && initialLives > 0) {
        newLives = Math.max(0, newLives - 1);
      }

      const updatedStatuses = { ...questionStatus, [currentQuestion.id]: 'answered' as const };
      const newScore = participant.score + scoreAwarded;
      const answersKey = `answers_${session.id}`;

      // Answer row object
      const newAnswer: Answer = {
        id: isMock ? `ans-mock-player-${Date.now()}` : crypto.randomUUID(),
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

      const updatedAnswersMap = { ...answersMap, [currentQuestion.id]: newAnswer };
      const updatedPart = {
        ...participant,
        score: newScore,
        lives: newLives,
        question_status: updatedStatuses
      };

      set({
        hasAnswered: true,
        isAnswerCorrect: isCorrect,
        scoreAwarded,
        lives: newLives,
        questionStatus: updatedStatuses,
        answersMap: updatedAnswersMap,
        participant: updatedPart
      });

      // Save to storage
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

      // Check Game Over (0 lives left in Casual mode)
      if (newLives === 0 && session.quiz_mode === 'santai' && initialLives > 0) {
        await get().submitFinalQuiz();
      }
    },

    submitFinalQuiz: async () => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session, participant } = get();
      if (!session || !participant) return;

      const isMock = checkIsMock();
      const updatedPart = { ...participant, is_completed: true };

      set({
        isCompleted: true,
        participant: updatedPart
      });

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
      // Draf/unsubmitted option changes can be watched reactively in the UI layer.
    },

    fetchLeaderboard: async () => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session } = get();
      if (!session) return [];
      const isMock = checkIsMock();
      if (isMock) {
        const key = `participants_${session.id}`;
        const parts = JSON.parse(localStorage.getItem(key) || '[]');
        return parts.sort((a: any, b: any) => b.score - a.score);
      } else {
        try {
          const res = await LeaderboardService.getLeaderboard(session.id);
          if (!res.success) throw res.error;
          return res.data || [];
        } catch (e) {
          console.error('Failed to fetch leaderboard:', e);
          return [];
        }
      }
    },

    fetchQuestionStats: async (questionId: string) => {
      // Auto-refresh token if expired
      await refreshAuth();

      const { session } = get();
      if (!session) return null;
      const isMock = checkIsMock();
      if (isMock) {
        // Return simulated stats for mock students
        return {
          correctCount: 4,
          incorrectCount: 1,
          totalCount: 5
        };
      } else {
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
      }
    },

    incrementViolation: async () => {
        // Auto-refresh token if expired
        await refreshAuth();

        const { session, participant } = get();
        if (!session || !participant) return;

        const isMock = checkIsMock();
        const newViolationCount = (participant.violation_count || 0) + 1;
        const updatedPart = { ...participant, violation_count: newViolationCount };

        set({ participant: updatedPart });

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

        // Check if violation limit exceeded
        const limit = session.auto_submit_on_violation ?? 3;
        if (newViolationCount >= limit) {
          await get().submitFinalQuiz();
        }
    },
  };
});
