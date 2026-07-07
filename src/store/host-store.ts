import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Participant, QuizSession, Question, Option, Answer, Quiz } from '../types';
import { checkIsMock } from './auth-store';

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
  let lobbySubscription: any = null;
  let answerSubscription: any = null;
  let sessionSubscription: any = null;
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
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Unauthorized');

          // Get full quiz details including pin_code, duration_per_question and quiz_mode
          const cacheBusterQuiz = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data: quizData } = await supabase
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .neq('id', cacheBusterQuiz)
            .single();

          if (!quizData) throw new Error('Kuis tidak ditemukan.');

          // Check for existing lobby or active session for this quiz (created by this host)
          const cacheBuster = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data: existingSessions } = await supabase
            .from('quiz_sessions')
            .select('*')
            .eq('quiz_id', quizId)
            .eq('host_id', user.id)
            .in('status', ['lobby', 'active'])
            .neq('id', cacheBuster)
            .order('created_at', { ascending: false });

          let sessionData = null;
          let isReused = false;

          if (existingSessions && existingSessions.length > 0) {
            sessionData = existingSessions[0];
            isReused = true;
            
            // Clean up other duplicate sessions if any
            if (existingSessions.length > 1) {
              const staleIds = existingSessions.slice(1).map(s => s.id);
              await supabase
                .from('quiz_sessions')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .in('id', staleIds);
            }
          } else {
            // Clean up any other active/lobby sessions of this quiz to avoid conflicts
            await supabase
              .from('quiz_sessions')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('quiz_id', quizId)
              .in('status', ['lobby', 'active']);

            // Create quiz session
            const { data: newSession, error: sessionError } = await supabase
              .from('quiz_sessions')
              .insert({
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
              })
              .select()
              .single();

            if (sessionError) throw sessionError;
            sessionData = newSession;
          }

          // Fetch questions
          const loadedQuestions = await get().fetchQuestions(quizId);

          // Load active question and options if session is already active
          let activeQuestion = null;
          let activeOptions: Option[] = [];
          if (sessionData.status === 'active' && sessionData.current_question_index >= 0) {
            if (loadedQuestions[sessionData.current_question_index]) {
              activeQuestion = loadedQuestions[sessionData.current_question_index];
              const { data: optionsData } = await supabase
                .from('options')
                .select('*')
                .eq('question_id', activeQuestion.id);
              activeOptions = (optionsData as Option[]) || [];
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
            const { data: existingParts } = await supabase
              .from('participants')
              .select('*')
              .eq('session_id', sessionData.id);
            if (existingParts) {
              set({ participants: existingParts as Participant[] });
            }

            const { data: existingAnswers } = await supabase
              .from('answers')
              .select('*, participants!inner(session_id)')
              .eq('participants.session_id', sessionData.id);
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

      const isMock = checkIsMock();

      if (isMock) {
        const updatedSession = { ...session, status: 'active' as const, current_stage: 'countdown' as const, current_question_index: 0 };
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
        set({ activeSession: updatedSession });
        return;
      }

      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

      const { error } = await supabase
        .from('quiz_sessions')
        .update({ status: 'active', current_stage: 'countdown', current_question_index: 0 })
        .eq('id', session.id);

      if (error) throw error;
      
      set({
        activeSession: {
          ...session,
          status: 'active',
          current_stage: 'countdown',
          current_question_index: 0,
        }
      });
    },

    nextQuestion: async () => {
      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

      const session = get().activeSession;
      if (!session) {
        throw new Error('Sesi kuis tidak aktif atau tidak ditemukan.');
      }

      let questions = get().questions;
      const isMock = checkIsMock();

      if (!isMock && (!questions || questions.length === 0)) {
        console.log('nextQuestion: Questions array empty in store. Fetching fallback from database...');
        try {
          const cacheBusterQs = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
          const { data: questionsData } = await supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', session.quiz_id)
            .neq('id', cacheBusterQs)
            .order('order_index', { ascending: true });

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

      // Fetch options for next question
      let options: Option[] = [];
      if (isMock) {
        const mockOpts = localStorage.getItem(`options_${nextQuestion.id}`);
        options = mockOpts ? JSON.parse(mockOpts) : [];
      } else {
        const cacheBusterOpts = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
        const { data } = await supabase
          .from('options')
          .select('*')
          .eq('question_id', nextQuestion.id)
          .neq('id', cacheBusterOpts);
        options = (data as Option[]) || [];
      }

      const updatedSession: QuizSession = {
        ...session,
        current_question_index: nextIndex,
        current_stage: 'countdown',
      };

      set({
        activeSession: updatedSession,
        currentQuestion: nextQuestion,
        currentOptions: options,
        submissions: [],
      });

      if (isMock) {
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
      } else {
        // Update database for supabase realtime
        const { error } = await supabase
          .from('quiz_sessions')
          .update({
            current_question_index: nextIndex,
            current_stage: 'countdown',
          })
          .eq('id', session.id);

        if (error) throw error;
      }
    },

    publishQuestionStage: async () => {
      const session = get().activeSession;
      const currentQuestion = get().currentQuestion;
      const options = get().currentOptions;
      if (!session || !currentQuestion) return;

      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

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

      set({ activeSession: updatedSession });

      if (isMock) {
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));

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
        const { error } = await supabase
          .from('quiz_sessions')
          .update({
            current_stage: 'question',
            question_started_at: now.toISOString(),
            question_expires_at: expiresAt.toISOString(),
          })
          .eq('id', session.id);

        if (error) throw error;
      }
    },

    showLeaderboard: async () => {
      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

      const session = get().activeSession;
      if (!session) return;

      const isMock = checkIsMock();
      const updatedSession: QuizSession = {
        ...session,
        current_stage: 'leaderboard',
      };

      set({ activeSession: updatedSession });

      if (isMock) {
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
      } else {
        const { error } = await supabase
          .from('quiz_sessions')
          .update({ current_stage: 'leaderboard' })
          .eq('id', session.id);

        if (error) throw error;
      }
    },

    endQuiz: async () => {
      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

      const session = get().activeSession;
      if (!session) return;

      const isMock = checkIsMock();
      const updatedSession: QuizSession = {
        ...session,
        status: 'completed',
        current_stage: 'finished',
        completed_at: new Date().toISOString(),
      };

      set({ activeSession: updatedSession, currentQuestion: null });

      if (isMock) {
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
      } else {
        await supabase
          .from('quiz_sessions')
          .update({
            status: 'completed',
            current_stage: 'finished',
            completed_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        
        get().unsubscribeAll();
      }
    },

    revealAnswer: async () => {
      // Auto-refresh token if expired
      try { await supabase.auth.getSession(); } catch (e) {}

      const session = get().activeSession;
      if (!session) return;

      const isMock = checkIsMock();
      const now = new Date();

      const updatedSession: QuizSession = {
        ...session,
        current_stage: 'question_result',
        question_expires_at: now.toISOString(),
      };

      set({ activeSession: updatedSession });

      if (isMock) {
        localStorage.setItem(`session_${session.id}`, JSON.stringify(updatedSession));
      } else {
        const { error } = await supabase
          .from('quiz_sessions')
          .update({
            current_stage: 'question_result',
            question_expires_at: now.toISOString(),
          })
          .eq('id', session.id);

        if (error) throw error;
      }
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
      try { await supabase.auth.getSession(); } catch (e) {}

      try {
        const cacheBusterQs = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', quizId)
          .neq('id', cacheBusterQs)
          .order('order_index', { ascending: true });
        if (!error && data) {
          set({ questions: data as Question[] });
          return data as Question[];
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
      try { await supabase.auth.getSession(); } catch (e) {}

      try {
        const cacheBuster = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
        const { data, error } = await supabase
          .from('participants')
          .select('*')
          .eq('session_id', sessionId)
          .neq('id', cacheBuster);

        if (error) throw error;
        if (data) {
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
      try { await supabase.auth.getSession(); } catch (e) {}

      try {
        const cacheBuster = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
        const { data, error } = await supabase
          .from('answers')
          .select('*, participants!inner(session_id)')
          .eq('participants.session_id', sessionId)
          .eq('question_id', currentQuestion.id)
          .neq('id', cacheBuster);

        if (error) throw error;
        if (data) {
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
      if (lobbySubscription) {
        supabase.removeChannel(lobbySubscription);
        lobbySubscription = null;
      }

      // Subscribe to changes in the participants table for this session
      lobbySubscription = supabase
        .channel(`lobby:${sessionId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
        }, (payload) => {
          const newPart = payload.new as Participant;
          if (newPart.session_id !== sessionId) return;

          set(state => {
            if (state.participants.some(p => p.id === newPart.id)) return state;
            return { participants: [...state.participants, newPart] };
          });
        })
        .subscribe();
    },

    subscribeToAnswers: (sessionId: string) => {
      if (answerSubscription) {
        supabase.removeChannel(answerSubscription);
        answerSubscription = null;
      }

      answerSubscription = supabase
        .channel(`answers:${sessionId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
        }, async (payload) => {
          const newAns = payload.new as Answer;
          
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
          const { data: partData } = await supabase
            .from('participants')
            .select('*')
            .eq('id', newAns.participant_id)
            .single();

          if (partData) {
            set(state => ({
              participants: state.participants.map(p => p.id === partData.id ? (partData as Participant) : p)
            }));
          }
        })
        .subscribe();
    },

    subscribeToSession: (sessionId: string) => {
      const isMock = checkIsMock();
      if (isMock) return;

      if (sessionSubscription) {
        supabase.removeChannel(sessionSubscription);
        sessionSubscription = null;
      }

      sessionSubscription = supabase
        .channel(`host_session_updates:${sessionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'quiz_sessions',
          filter: `id=eq.${sessionId}`,
        }, async (payload) => {
          console.log('HostStore: Realtime session update payload:', payload);
          const updatedSess = payload.new as QuizSession;
          if (updatedSess.id !== sessionId) return;

          const currentQuestion = get().currentQuestion;
          const questions = get().questions;
          let activeQuestion = currentQuestion;
          let activeOptions = get().currentOptions;

          if (updatedSess.current_question_index >= 0) {
            const indexChanged = !currentQuestion || get().activeSession?.current_question_index !== updatedSess.current_question_index;
            if (indexChanged && questions[updatedSess.current_question_index]) {
              activeQuestion = questions[updatedSess.current_question_index];
              const cacheBusterOpts = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().padStart(12, '0');
              const { data } = await supabase
                .from('options')
                .select('*')
                .eq('question_id', activeQuestion.id)
                .neq('id', cacheBusterOpts);
              activeOptions = (data as Option[]) || [];
            }
          }

          set({
            activeSession: updatedSess,
            currentQuestion: activeQuestion,
            currentOptions: activeOptions,
          });
        })
        .subscribe((status, err) => {
          console.log(`HostStore: Realtime channel status for session ${sessionId}:`, status, err);
        });
    },

    unsubscribeAll: () => {
      if (lobbySubscription) {
        supabase.removeChannel(lobbySubscription);
        lobbySubscription = null;
      }
      if (answerSubscription) {
        supabase.removeChannel(answerSubscription);
        answerSubscription = null;
      }
      if (sessionSubscription) {
        supabase.removeChannel(sessionSubscription);
        sessionSubscription = null;
      }
    }
  };
});
