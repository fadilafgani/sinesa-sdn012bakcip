import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Participant, QuizSession, Question, Option, Answer, Quiz } from '../types';
import { checkIsMock } from './auth-store';

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
  let sessionChannel: any = null;
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

          return true;
        }

        // Supabase Flow
        try {
          const cacheBuster = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          // 1. Get quiz by pin
          let { data: quizData, error: quizErr } = await supabase
            .from('quizzes')
            .select('*')
            .eq('pin_code', pinCode)
            .neq('id', cacheBuster)
            .single();

          if (quizErr || !quizData) {
            console.log('joinSession: Quiz not found on first try, retrying in 1s...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryRes = await supabase
              .from('quizzes')
              .select('*')
              .eq('pin_code', pinCode)
              .neq('id', cacheBuster)
              .single();
            quizData = retryRes.data;
            quizErr = retryRes.error;
          }

          if (quizErr || !quizData) {
            set({ error: 'Kode PIN kuis tidak ditemukan.', loading: false });
            return false;
          }

          // 2. Get active session
          let { data: sessionData, error: sessionErr } = await supabase
            .from('quiz_sessions')
            .select('*')
            .eq('quiz_id', quizData.id)
            .in('status', ['lobby', 'active'])
            .neq('id', cacheBuster)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (sessionErr || !sessionData) {
            console.log('joinSession: Session not found on first try, retrying in 1s...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retrySess = await supabase
              .from('quiz_sessions')
              .select('*')
              .eq('quiz_id', quizData.id)
              .in('status', ['lobby', 'active'])
              .neq('id', cacheBuster)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            sessionData = retrySess.data;
            sessionErr = retrySess.error;
          }

          if (sessionErr || !sessionData) {
            set({ error: 'Kuis belum aktif atau sudah selesai.', loading: false });
            return false;
          }

          // 3. Check if participant already exists in this session
          const { data: existingPart } = await supabase
            .from('participants')
            .select('*')
            .eq('session_id', sessionData.id)
            .eq('display_name', displayName)
            .maybeSingle();

          let partData = existingPart;

          if (!partData) {
            // Create participant
            let { data: newPart, error: partErr } = await supabase
              .from('participants')
              .insert({
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
              })
              .select()
              .single();

            // Robust Fallback: If foreign key or other constraint error, retry without student_id
            if (partErr && studentId) {
              console.warn('Failed to insert participant with student_id, retrying without student_id:', partErr);
              const { data: retryPart, error: retryErr } = await supabase
                .from('participants')
                .insert({
                  session_id: sessionData.id,
                  student_id: null,
                  display_name: displayName,
                  score: 0,
                  lives: quizData.lives_count !== undefined ? quizData.lives_count : 3,
                  skipped_questions: [],
                  question_status: {},
                  current_progress: 0,
                  violation_count: 0,
                  is_completed: false,
                })
                .select()
                .single();
              newPart = retryPart;
              partErr = retryErr;
            }

            if (partErr) {
              const isUniqueViolation = partErr.code === '23505';
              set({ 
                error: isUniqueViolation 
                  ? 'Nama tampilan sudah digunakan di lobby ini.' 
                  : `Gagal bergabung: ${partErr.message} (Code: ${partErr.code})`, 
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
              const { data: updatedPart, error: updateErr } = await supabase
                .from('participants')
                .update({ student_id: studentId })
                .eq('id', partData.id)
                .select()
                .single();
              
              if (!updateErr && updatedPart) {
                partData = updatedPart;
              }
            }
          }

          // Fetch all questions of the quiz
          const cacheBusterQs = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data: questions } = await supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', sessionData.quiz_id)
            .neq('id', cacheBusterQs)
            .order('order_index', { ascending: true });

          const loadedQs = (questions as Question[]) || [];

          // Fetch participant answers
          const { data: answersData } = await supabase
            .from('answers')
            .select('*')
            .eq('participant_id', partData.id);
          
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
            currentQuestionIndex: partData.current_progress || 0,
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
            const activeIdx = partData.current_progress || 0;
            const activeQ = loadedQs[activeIdx];
            if (activeQ) {
              const cacheBusterOpts = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
              const { data: options } = await supabase
                .from('options')
                .select('*')
                .eq('question_id', activeQ.id)
                .neq('id', cacheBusterOpts);

              const hasAns = !!map[activeQ.id];
              set({
                currentQuestion: activeQ,
                currentOptions: (options as Option[]) || [],
                hasAnswered: hasAns,
                isAnswerCorrect: hasAns ? map[activeQ.id].is_correct : null,
                scoreAwarded: hasAns ? map[activeQ.id].score_awarded : 0,
              });
            }
          }

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
      const { session } = get();
      if (!session) return;
      
      const isSelfPaced = session.quiz_mode === 'serius' || session.quiz_mode === 'santai';
      if (isSelfPaced) {
        await get().submitSelfPacedAnswer(arg);
        return;
      }

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

      const now = new Date();
      const startedAt = session.question_started_at ? new Date(session.question_started_at) : now;
      const responseTime = Math.max(0, now.getTime() - startedAt.getTime());

      const scoreAwarded = isCorrect ? currentQuestion.points : 0;

      set({
        hasAnswered: true,
        isAnswerCorrect: isCorrect,
        scoreAwarded,
      });

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
        const updatedPart = { ...participant, score: newScore };
        set({ participant: updatedPart });

        const partsKey = `participants_${session.id}`;
        const parts = JSON.parse(localStorage.getItem(partsKey) || '[]');
        const updatedParts = parts.map((p: any) => p.id === participant.id ? updatedPart : p);
        localStorage.setItem(partsKey, JSON.stringify(updatedParts));
        return;
      }

      try {
        const { error: insertErr } = await supabase
          .from('answers')
          .insert({
            participant_id: participant.id,
            question_id: currentQuestion.id,
            selected_option_id: optionIdToSave,
            selected_option_ids: optionIdsToSave,
            matching_answers: matchingAnswersToSave,
            is_correct: isCorrect,
            response_time_ms: responseTime,
            score_awarded: scoreAwarded,
          });

        if (insertErr) throw insertErr;

        const newScore = participant.score + scoreAwarded;
        const { data: updatedPart } = await supabase
          .from('participants')
          .update({ score: newScore })
          .eq('id', participant.id)
          .select()
          .single();

        if (updatedPart) {
          set({ participant: updatedPart as Participant });
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
      sessionChannel = supabase
        .channel(`session_updates:${sessionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'quiz_sessions',
        }, async (payload) => {
          const updatedSess = payload.new as QuizSession;
          if (updatedSess.id !== sessionId) return;
          get().handleSessionUpdate(updatedSess);
        })
        .subscribe();

      // Start a fallback polling interval (every 2 seconds) in case Supabase Realtime fails in production
      const intervalId = window.setInterval(async () => {
        try {
          const cacheBuster = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data: latestSess, error } = await supabase
            .from('quiz_sessions')
            .select('*')
            .eq('id', sessionId)
            .neq('id', cacheBuster)
            .single();

          if (!error && latestSess) {
            const previousSess = get().session;
            const indexChanged = previousSess?.current_question_index !== latestSess.current_question_index;
            const statusChanged = previousSess?.status !== latestSess.status;
            
            if (statusChanged || indexChanged) {
              console.log('play-store polling fallback: session updated', latestSess);
              await get().handleSessionUpdate(latestSess as QuizSession);
            }
          }
        } catch (err) {
          console.error('play-store polling fallback error:', err);
        }
      }, 2000);

      set({ pollingInterval: intervalId });
    },

    stopListening: () => {
      if (get().pollingInterval) {
        window.clearInterval(get().pollingInterval!);
        set({ pollingInterval: null });
      }

      if (sessionChannel) {
        supabase.removeChannel(sessionChannel);
        sessionChannel = null;
      }
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
      const isSelfPaced = updatedSess.quiz_mode === 'serius' || updatedSess.quiz_mode === 'santai';

      set({ session: updatedSess });

      if (updatedSess.status === 'completed') {
        get().stopListening();
        set({ isCompleted: true });
        return;
      }

      // If we are in self-paced mode, we don't automatically follow the host index
      if (isSelfPaced) {
        // If transitioning from lobby to active, ensure questions are loaded
        if (updatedSess.status === 'active' && (!previousSess || previousSess.status === 'lobby')) {
          const participant = get().participant;
          if (participant) {
            await get().setQuestionProgress(participant.current_progress || 0);
          }
        }
        return;
      }

      // Legacy host-paced logic
      if (updatedSess.current_question_index >= 0 && 
          (!previousSess || 
           previousSess.current_question_index !== updatedSess.current_question_index ||
           get().currentQuestion === null)) {
         
         try {
           let questions = get().questions;
           if (!questions || questions.length === 0) {
             const cacheBusterQs = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
             const { data: questionsData, error: qsErr } = await supabase
               .from('questions')
               .select('*')
               .eq('quiz_id', updatedSess.quiz_id)
               .neq('id', cacheBusterQs)
               .order('order_index', { ascending: true });
             if (qsErr) throw qsErr;
             questions = (questionsData as Question[]) || [];
             set({ questions });
           }

           if (questions && questions[updatedSess.current_question_index]) {
             const nextQuestion = questions[updatedSess.current_question_index] as Question;

             const cacheBusterOpts = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
             const { data: options, error: optsErr } = await supabase
               .from('options')
               .select('*')
               .eq('question_id', nextQuestion.id)
               .neq('id', cacheBusterOpts);
             if (optsErr) throw optsErr;

             set({
               currentQuestionIndex: updatedSess.current_question_index,
               currentQuestion: nextQuestion,
               currentOptions: (options as Option[]) || [],
               hasAnswered: false,
               isAnswerCorrect: null,
               scoreAwarded: 0,
             });
           }
         } catch (err) {
           console.error('Error handling session update gameplay progress:', err);
         }
      }
    },

    // ==========================================
    // NEW SELF-PACED ACTIONS
    // ==========================================

    setQuestionProgress: async (index: number) => {
      const { questions, participant, answersMap, session } = get();
      if (!session || !participant || index < 0 || index >= questions.length) return;

      const activeQ = questions[index];
      const isMock = checkIsMock();

      // Fetch options for the active question
      let options: Option[] = [];
      try {
        if (isMock) {
          const mockOpts = localStorage.getItem(`options_${activeQ.id}`);
          options = mockOpts ? JSON.parse(mockOpts) : [];
        } else {
          const cacheBusterOpts = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data, error } = await supabase
            .from('options')
            .select('*')
            .eq('question_id', activeQ.id)
            .neq('id', cacheBusterOpts);
          if (error) throw error;
          options = (data as Option[]) || [];
        }
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
          const { error } = await supabase
            .from('participants')
            .update({ current_progress: index })
            .eq('id', participant.id);
          if (error) throw error;
        }
      } catch (err) {
        console.warn('Failed to update current progress on server:', err);
        // Don't throw here to avoid disrupting client gameplay flow if local state updated successfully
      }
    },

    skipQuestion: async (questionId: string) => {
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
        await supabase
          .from('participants')
          .update({
            question_status: updatedStatuses,
            skipped_questions: updatedSkipped
          })
          .eq('id', participant.id);
      }

      // Navigate to next question automatically if available, otherwise stay
      if (currentQuestionIndex + 1 < questions.length) {
        await get().setQuestionProgress(currentQuestionIndex + 1);
      }
    },

    submitSelfPacedAnswer: async (arg: string | { optionId?: string; optionIds?: string[]; matchingAnswers?: Record<string, string> }) => {
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
          await supabase.from('answers').insert({
            id: newAnswer.id,
            participant_id: participant.id,
            question_id: currentQuestion.id,
            selected_option_id: optionIdToSave,
            selected_option_ids: optionIdsToSave,
            matching_answers: matchingAnswersToSave,
            is_correct: isCorrect,
            response_time_ms: responseTime,
            score_awarded: scoreAwarded,
          });

          await supabase.from('participants').update({
            score: newScore,
            lives: newLives,
            question_status: updatedStatuses
          }).eq('id', participant.id);
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
          await supabase
            .from('participants')
            .update({ is_completed: true })
            .eq('id', participant.id);
        } catch (e) {
          console.error('Failed to submit final quiz:', e);
        }
      }
    },

    saveAnswerState: (_questionId: string, _answerData: any) => {
      // Local state is automatically updated during submits or skips.
      // Draf/unsubmitted option changes can be watched reactively in the UI layer.
    },

    fetchLeaderboard: async () => {
      const { session } = get();
      if (!session) return [];
      const isMock = checkIsMock();
      if (isMock) {
        const key = `participants_${session.id}`;
        const parts = JSON.parse(localStorage.getItem(key) || '[]');
        return parts.sort((a: any, b: any) => b.score - a.score);
      } else {
        try {
          const { data, error } = await supabase
            .from('participants')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false });
          if (error) throw error;
          return (data as Participant[]) || [];
        } catch (e) {
          console.error('Failed to fetch leaderboard:', e);
          return [];
        }
      }
    },

    fetchQuestionStats: async (questionId: string) => {
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
          // Fetch participant IDs for this session
          const { data: parts, error: partsErr } = await supabase
            .from('participants')
            .select('id')
            .eq('session_id', session.id);
          
          if (partsErr) throw partsErr;
          if (!parts || parts.length === 0) return null;
          const partIds = parts.map(p => p.id);
          
          const { data: answers, error: ansErr } = await supabase
            .from('answers')
            .select('is_correct')
            .eq('question_id', questionId)
            .in('participant_id', partIds);
          
          if (ansErr) throw ansErr;
          if (!answers || answers.length === 0) {
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
            await supabase
              .from('participants')
              .update({ violation_count: newViolationCount })
              .eq('id', participant.id);
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
