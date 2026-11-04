import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useQuizSession } from '@/shared/hooks/useQuizSession';
import { useQuestion } from '@/shared/hooks/useQuestion';
import { useParticipants } from '@/shared/hooks/useParticipants';
import { useAnswer } from '@/shared/hooks/useAnswer';
import { useCountdown } from '@/shared/hooks/useCountdown';
import { useTimer } from '@/shared/hooks/useTimer';
import { useNavigation } from '@/shared/hooks/useNavigation';
import { sessionStore } from '@/features/session/stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Play, Users, Award, ChevronRight, BarChart3, Volume2, Copy, Check, ShieldAlert, AlertTriangle, FileQuestion, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { LatexRenderer } from '@/shared/components/latex-renderer';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { showConfirm, showError } from '@/shared/utils/swal';
import { QuizService } from '@/features/quiz/services/quiz.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { SessionService } from '@/features/session/services/session.service';
import { QuestionService } from '@/features/question/services/question.service';
import { useSessionStore } from '@/features/session/stores/session-store';
import { useQuestionStore } from '@/features/question/stores/question-store';
import { LazyImage } from '@/shared/components/lazy-image';
import { getSafeMediaUrl } from '@/shared/utils/media';
import { LeaderboardService } from '@/features/leaderboard/services/leaderboard.service';
import { useLeaderboardStore } from '@/features/leaderboard/stores/leaderboard-store';
import { useParticipantStore } from '@/features/participant/stores/participant-store';

export type HostPageState = 'loading' | 'success' | 'access_denied' | 'not_found' | 'error';

export interface HostErrorInfo {
  title: string;
  message: string;
  statusCode?: number;
}

export const HostSession: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawId = searchParams.get('id') || searchParams.get('sessionId') || searchParams.get('session_id') || searchParams.get('quizId');
  const targetId = rawId ? rawId.trim() : '';

  const { isMock, profile } = useAuthStore(useShallow(state => ({ isMock: state.isMock, profile: state.profile })));
  const { navigate } = useNavigation();
  const {
    activeSession,
    quiz,
    createSession,
    startQuiz,
    nextQuestion,
    endQuiz,
    clearSession,
    subscribeToLobby,
    subscribeToAnswers,
    subscribeToSession,
    unsubscribeAll,
    publishQuestionStage,
    revealAnswer,
    fetchParticipants,
    fetchAnswers,
    showLeaderboard,
  } = useQuizSession();
  const { questions, currentQuestion, currentOptions, fetchQuestions } = useQuestion();
  const { participants } = useParticipants();
  const { submissions } = useAnswer();
  const realtimeStatus = useSessionStore(state => state.realtimeStatus);

  const renderConnectionToast = () => {
    if (realtimeStatus === 'RECONNECTING' || realtimeStatus === 'CONNECTING') {
      return (
        <div data-testid="connection-banner" className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500 text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-xl animate-pulse backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-black animate-ping" />
          Menghubungkan ulang ke server...
        </div>
      );
    }
    if (realtimeStatus === 'RECONNECTED') {
      return (
        <div data-testid="connection-banner" className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur animate-fade-in">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Terhubung kembali
        </div>
      );
    }
    if (realtimeStatus === 'POLLING_FALLBACK') {
      return (
        <div data-testid="connection-banner" className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Mode pemulihan polling aktif (data tersinkron)
        </div>
      );
    }
    if (realtimeStatus === 'DISCONNECTED') {
      return (
        <div data-testid="connection-banner" className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur">
          <AlertCircle className="w-3.5 h-3.5" />
          Koneksi terputus
        </div>
      );
    }
    if (realtimeStatus === 'ERROR') {
      return (
        <div data-testid="connection-banner" className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-rose-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur">
          <AlertCircle className="w-3.5 h-3.5" />
          Koneksi terganggu. Menggunakan sinkronisasi cadangan...
        </div>
      );
    }
    return null;
  };

  console.log('COMPONENT_RENDER', 'HostSession', {
    stage: activeSession?.current_stage,
    status: activeSession?.status,
    qIndex: activeSession?.current_question_index,
    partCount: participants.length,
    ansCount: submissions.length
  });

  console.log('UI_RENDERED', {
    role: 'host',
    stage: activeSession?.current_stage,
    status: activeSession?.status,
    questionIndex: activeSession?.current_question_index,
    partCount: participants.length,
    ansCount: submissions.length,
    timestamp: Date.now()
  });

  const [pinCode, setPinCode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false);
  
  // Zoom Media State
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomResetKey, setZoomResetKey] = useState<number>(0);
  
  const handleCopyPin = async () => {
    if (!pinCode) return;
    try {
      await navigator.clipboard.writeText(pinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy PIN:', err);
    }
  };

  // Diagnostics State
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [lastPollTime, setLastPollTime] = useState<string>('Never');
  
  // Host Page Lifecycle State Machine
  const [hostState, setHostState] = useState<HostPageState>('loading');
  const [errorInfo, setErrorInfo] = useState<HostErrorInfo | null>(null);

  useEffect(() => {
    if (!activeSession?.id || isMock) return;
    const unsubscribe = sessionStore.subscribe(() => {
      setLastPollTime(new Date().toLocaleTimeString());
    });
    return () => unsubscribe();
  }, [activeSession?.id, isMock]);

  // Initialize Session
  useEffect(() => {
    let isCancelled = false;

    const init = async () => {
      setHostState('loading');
      setErrorInfo(null);

      if (!targetId) {
        setHostState('not_found');
        setErrorInfo({
          title: 'Sesi Tidak Ditemukan',
          message: 'Parameter ID kuis atau ID sesi kuis tidak ditemukan pada tautan.',
          statusCode: 400
        });
        return;
      }

      try {
        if (isMock) {
          // 1. Check mock sessions
          const allSessions = JSON.parse(localStorage.getItem('sessions') || '[]');
          const targetSession = allSessions.find((s: any) => s.id === targetId);
          if (targetSession) {
            if (targetSession.host_id !== profile?.id && profile?.role !== 'admin') {
              setHostState('access_denied');
              setErrorInfo({
                title: 'Akses Ditolak',
                message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
                statusCode: 403
              });
              return;
            }
            useSessionStore.setState({ activeSession: targetSession });
            setPinCode(targetSession.pin_code || '');
            setHostState('success');
            return;
          }

          // 2. Check mock quizzes
          const allQuizzes = JSON.parse(localStorage.getItem('quizzes') || '[]');
          const targetQuiz = allQuizzes.find((q: any) => q.id === targetId);
          if (!targetQuiz) {
            setHostState('not_found');
            setErrorInfo({
              title: 'Kuis Tidak Ditemukan',
              message: 'Kuis mock tidak ditemukan dalam database.',
              statusCode: 404
            });
            return;
          }

          if (targetQuiz.teacher_id !== profile?.id && profile?.role !== 'admin') {
            setHostState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
              statusCode: 403
            });
            return;
          }

          const pin = await createSession(targetId);
          if (pin) {
            setPinCode(pin);
            setHostState('success');
          } else {
            setHostState('error');
            setErrorInfo({
              title: 'Gagal Membuka Sesi',
              message: 'Gagal memulai sesi kuis mock.',
              statusCode: 500
            });
          }
          return;
        }

        // Real API Mode
        await AuthService.refreshSession();

        // 1. Probe if targetId is a session ID
        const sessionRes = await SessionService.getSession(targetId);

        if (sessionRes.status === 403) {
          setHostState('access_denied');
          setErrorInfo({
            title: 'Akses Ditolak',
            message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
            statusCode: 403
          });
          return;
        }

        if (sessionRes.success && sessionRes.data) {
          const sessionData = sessionRes.data;
          if (profile?.role === 'teacher' && sessionData.host_id !== profile.id) {
            setHostState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
              statusCode: 403
            });
            return;
          }

          const quizRes = await QuizService.getQuizById(sessionData.quiz_id);
          if (quizRes.status === 403) {
            setHostState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
              statusCode: 403
            });
            return;
          }

          const questionsRes = await QuestionService.getQuestions(sessionData.quiz_id);
          const loadedQuestions = questionsRes.success && questionsRes.data ? questionsRes.data : [];

          useSessionStore.setState({ activeSession: sessionData, quiz: quizRes.data || null });
          useQuestionStore.setState({ questions: loadedQuestions });
          setPinCode(quizRes.data?.pin_code || '');
          setHostState('success');
          return;
        }

        // If targetId was not a session (404), probe if targetId is a quiz ID
        if (sessionRes.status === 404 || !sessionRes.success) {
          if (sessionRes.status && sessionRes.status >= 500) {
            setHostState('error');
            setErrorInfo({
              title: 'Kesalahan Server',
              message: typeof sessionRes.error === 'string' ? sessionRes.error : 'Terjadi kesalahan pada server saat memuat sesi kuis.',
              statusCode: sessionRes.status
            });
            return;
          }

          const quizRes = await QuizService.getQuizById(targetId);

          if (quizRes.status === 403 || (typeof quizRes.error === 'string' && (quizRes.error.toLowerCase().includes('akses ditolak') || quizRes.error.toLowerCase().includes('tidak memiliki izin')))) {
            setHostState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
              statusCode: 403
            });
            return;
          }

          if (quizRes.status === 404 || !quizRes.success || !quizRes.data) {
            setHostState('not_found');
            setErrorInfo({
              title: 'Sesi Tidak Ditemukan',
              message: 'Sesi kuis atau kuis dengan ID tersebut tidak ditemukan.',
              statusCode: 404
            });
            return;
          }

          if (profile?.role === 'teacher' && quizRes.data.teacher_id !== profile.id) {
            setHostState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
              statusCode: 403
            });
            return;
          }

          // If the store already has an active session for this quiz, reuse it
          const currentSession = sessionStore.getState().activeSession;
          if (currentSession && currentSession.quiz_id === targetId && currentSession.status !== 'completed') {
            setPinCode(quizRes.data?.pin_code || '');
            setHostState('success');
            return;
          }

          const generatedPin = await createSession(targetId);
          if (generatedPin) {
            setPinCode(generatedPin);
            setHostState('success');
          } else {
            const curSession = sessionStore.getState().activeSession;
            if (curSession) {
              setHostState('success');
            } else {
              setHostState('error');
              setErrorInfo({
                title: 'Gagal Membuka Sesi',
                message: 'Tidak dapat memulai atau menghubungkan ke sesi kuis. Pastikan server aktif dan Anda memiliki hak akses.',
                statusCode: 500
              });
            }
          }
        }
      } catch (err: any) {
        console.error('HostSession init caught error:', err);
        const is403 = err?.status === 403 || err?.statusCode === 403;
        setHostState(is403 ? 'access_denied' : 'error');
        setErrorInfo({
          title: is403 ? 'Akses Ditolak' : 'Kesalahan Sistem',
          message: is403
            ? 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.'
            : (err?.message || 'Terjadi kesalahan tidak terduga saat memverifikasi sesi kuis.'),
          statusCode: is403 ? 403 : 500
        });
      } finally {
        if (!isCancelled) {
          // Guarantee loading state always ends
          setHostState(prev => prev === 'loading' ? 'error' : prev);
        }
      }
    };

    init();

    return () => {
      isCancelled = true;
      console.log('HostSession: Cleaning up session...');
      clearSession();
    };
  }, [targetId]);

  // Auto-reload questions if they are empty (handles replica lag from editor)
  useEffect(() => {
    if (hostState === 'success' && activeSession && questions.length === 0 && targetId) {
      console.log('HostSession: Questions are empty. Starting background check...');
      let attempts = 0;
      const maxAttempts = 5;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const quizIdToFetch = activeSession.quiz_id || targetId;
          const fetched = await fetchQuestions(quizIdToFetch);
          if (fetched && fetched.length > 0) {
            console.log('HostSession: Successfully fetched questions in background. Count =', fetched.length);
            clearInterval(interval);
          } else if (attempts >= maxAttempts) {
            console.warn('HostSession: Reached max attempts fetching questions');
            clearInterval(interval);
            setHostState('error');
            setErrorInfo({
              title: 'Soal Kuis Kosong',
              message: 'Kuis ini belum memiliki soal atau gagal dimuat setelah beberapa percobaan.',
              statusCode: 404
            });
          }
        } catch (e) {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
          }
        }
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [hostState, activeSession?.id, questions.length, targetId]);

  // Load initial data once and subscribe to Realtime updates
  useEffect(() => {
    if (hostState !== 'success' || !activeSession?.id || isMock) return;

    const sessionId = activeSession.id;
    console.log('HostSession: Initializing session subscriptions for ID:', sessionId);

    const loadInitialData = async () => {
      try {
        const currentStatus = activeSession?.status;
        await fetchParticipants(sessionId);
        if (currentStatus === 'active') {
          await fetchAnswers(sessionId);
        }
        if (currentStatus === 'completed' || activeSession?.current_stage === 'finished') {
          const lbRes = await LeaderboardService.getLeaderboard(sessionId);
          if (lbRes.success && lbRes.data) {
            useLeaderboardStore.setState({ leaderboard: lbRes.data });
            const pMap = new Map(useParticipantStore.getState().participants.map(p => [p.id, p]));
            lbRes.data.forEach(lb => {
              const existing = pMap.get(lb.id);
              if (existing) {
                pMap.set(lb.id, { ...existing, score: lb.score, rank: lb.rank });
              } else {
                pMap.set(lb.id, lb);
              }
            });
            useParticipantStore.setState({ participants: Array.from(pMap.values()) });
          }
        }
      } catch (err) {
        console.error('HostSession: Error loading initial data:', err);
      }
    };

    loadInitialData();

    subscribeToSession(sessionId);
    subscribeToLobby(sessionId);
    subscribeToAnswers(sessionId);

    return () => {
      console.log('HostSession: Cleaning up subscriptions for ID:', sessionId);
      unsubscribeAll();
    };
  }, [hostState, activeSession?.id, isMock, subscribeToSession, subscribeToLobby, subscribeToAnswers, unsubscribeAll]);

  // ponytail: Authoritative fetch of final participant scores & leaderboard when stage is finished/completed
  useEffect(() => {
    if (!activeSession?.id || isMock) return;
    if (activeSession.current_stage === 'finished' || activeSession.status === 'completed') {
      fetchParticipants(activeSession.id);
      LeaderboardService.getLeaderboard(activeSession.id).then(res => {
        if (res.success && res.data) {
          useLeaderboardStore.setState({ leaderboard: res.data });
          const pMap = new Map(useParticipantStore.getState().participants.map(p => [p.id, p]));
          res.data.forEach(lb => {
            const existing = pMap.get(lb.id);
            if (existing) {
              pMap.set(lb.id, { ...existing, score: lb.score, rank: lb.rank });
            } else {
              pMap.set(lb.id, lb);
            }
          });
          useParticipantStore.setState({ participants: Array.from(pMap.values()) });
        }
      });
    }
  }, [activeSession?.id, activeSession?.current_stage, activeSession?.status, isMock, fetchParticipants]);

  const serverTimeOffset = activeSession?.server_time ? Date.now() - activeSession.server_time : 0;

  // Manage countdown automatically via custom hook (anchored to shared server timestamp)
  const isCountdownStage = activeSession?.current_stage === 'countdown';
  const countdown = useCountdown({
    expiresAt: activeSession?.countdown_expires_at,
    serverTimeOffset,
    duration: activeSession?.countdown_duration || 3,
    enabled: isCountdownStage || (activeSession?.current_stage === 'question' && !!activeSession?.countdown_expires_at),
    onComplete: () => {
      if (activeSession?.current_stage === 'countdown' && activeSession.id) {
        publishQuestionStage();
      }
    }
  });

  const isCountdownActive = isCountdownStage || (activeSession?.current_stage === 'question' && countdown > 0 && !!activeSession?.countdown_expires_at);

  // Handle gameplay question timer via custom hook
  const timer = useTimer({
    expiresAt: activeSession?.question_expires_at || null,
    serverTimeOffset,
    enabled: activeSession?.current_stage === 'question' && !!currentQuestion && !isCountdownActive,
    onTimeUp: () => {
      handleRevealAnswer();
    }
  });

  // Reveal correct answer
  const handleRevealAnswer = async () => {
    console.log('HOST_NEXT_STAGE', 'Guru memicu revealAnswer');
    try {
      await revealAnswer();
    } catch (err) {
      console.error('Error revealing answer in DB:', err);
    }
  };

  // Launch the quiz lobby -> active state
  const handleStartGame = async () => {
    console.log('HOST_NEXT_STAGE', 'Guru memicu startQuiz');
    if (isStartingGame) return;
    setIsStartingGame(true);
    try {
      console.log('HostSession: handleStartGame clicked. Questions loaded =', questions.length);

      let currentQuestions = questions;
      const quizIdToFetch = activeSession?.quiz_id || targetId;
      if (currentQuestions.length === 0 && quizIdToFetch) {
        console.log('HostSession: Questions are empty on start. Retrying fetch immediately...');
        const fetched = await fetchQuestions(quizIdToFetch);
        if (fetched && fetched.length > 0) {
          currentQuestions = fetched;
        }
      }

      if (currentQuestions.length === 0) {
        showError('Soal Kosong', 'Gagal memuat soal kuis dari database. Silakan tunggu beberapa saat agar database siap, lalu klik Mulai Kuis lagi.');
        return;
      }

      if (participants.length === 0 && !isMock) {
        const confirmRes = await showConfirm(
          'Mulai Kuis',
          'Belum ada murid yang bergabung di lobby ini. Apakah Anda ingin tetap memulai kuis (untuk mode uji coba)?',
          'Ya, Mulai',
          'Batal'
        );
        if (!confirmRes.isConfirmed) {
          return;
        }
      }
      
      console.log('HostSession: calling startQuiz()...');
      await startQuiz();
    } catch (err: any) {
      console.error('HostSession: Error starting game:', err);
      showError('Gagal', `Gagal memulai kuis: ${err.message || err}`);
    } finally {
      setIsStartingGame(false);
    }
  };

  // Progress to showing leaderboard
  const handleShowLeaderboard = async () => {
    console.log('HOST_NEXT_STAGE', 'Guru memicu showLeaderboard');
    try {
      await showLeaderboard();
    } catch (err) {
      console.error('Error showing leaderboard in DB:', err);
    }
  };

  // Progress to next question or end quiz
  const handleNextStep = async () => {
    console.log('HOST_NEXT_STAGE', 'Guru memicu nextQuestion / nextStep');
    console.log('HostSession: handleNextStep clicked. current index =', activeSession?.current_question_index, 'total questions =', questions.length);
    if (activeSession!.current_question_index + 1 >= questions.length) {
      console.log('HostSession: all questions completed. Ending quiz...');
      try {
        await endQuiz();
        triggerConfetti();
      } catch (err: any) {
        console.error('HostSession: Failed to end quiz:', err);
        showError('Gagal', `Gagal menyelesaikan kuis: ${err.message || err}`);
      }
    } else {
      console.log('HostSession: loading next question...');
      try {
        await nextQuestion();
      } catch (err: any) {
        console.error('HostSession: Failed to load next question:', err);
        showError('Gagal', `Gagal memuat soal berikutnya: ${err.message || err}`);
      }
    }
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  // Format bar chart data based on submissions
  const getChartData = () => {
    const alphabet = ['A', 'B', 'C', 'D'];
    return currentOptions.map((opt, idx) => {
      const answersForThisOpt = submissions.filter(s => s.selected_option_id === opt.id).length;
      return {
        name: alphabet[idx % 4],
        Option: opt.option_text,
        Jumlah: answersForThisOpt,
        isCorrect: opt.is_correct
      };
    });
  };

  // Get Top Players Sorted (consistent tie-breaker with database)
  const getLeaderboard = () => {
    const liveLeaderboard = useLeaderboardStore.getState().leaderboard;
    const source = (participants.length > 0 && participants.some(p => p.score > 0))
      ? participants
      : (liveLeaderboard.length > 0 ? liveLeaderboard : participants);

    return [...source].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const timeA = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const timeB = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    }).slice(0, 5);
  };

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-panel p-8 rounded-3xl w-full max-w-2xl space-y-6 shadow-xl border-primary/20"
      >
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
          Bergabung di Handphone / Laptop Anda
        </p>

        {quiz?.opening_text && (
          <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 text-center max-w-lg mx-auto">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Pesan Pembuka</p>
            <p className="text-sm text-foreground italic font-medium">"{quiz.opening_text}"</p>
          </div>
        )}

        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/15 max-w-md mx-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Alamat Website:
          </p>
          <p className="text-xl font-black text-foreground mt-1 select-all font-mono">
            {window.location.origin}/
          </p>
        </div>
        
        {/* Large Code Display */}
        <div className="space-y-2 flex flex-col items-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">KODE PIN MASUK</span>
          <div className="flex items-center gap-4 justify-center bg-primary/5 px-8 py-3 rounded-2xl border border-primary/10 hover:border-primary/20 transition-all duration-300 group relative">
            <h2 className="text-6xl font-black tracking-wider text-primary font-mono select-all">
              {pinCode || '------'}
            </h2>
            <button
              onClick={handleCopyPin}
              disabled={!pinCode}
              title="Salin PIN"
              className="p-2 rounded-xl hover:bg-primary/10 active:scale-95 transition-all text-primary/70 hover:text-primary cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? (
                <Check className="h-6 w-6 text-green-600 animate-in fade-in zoom-in-75 duration-200" />
              ) : (
                <Copy className="h-6 w-6 transition-transform group-hover:scale-110" />
              )}
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="h-6 w-6 text-primary animate-pulse" />
            <span className="text-lg font-bold text-foreground">
              {participants.length} Murid Bergabung
            </span>
          </div>
          <button
            onClick={handleStartGame}
            disabled={isStartingGame}
            className="flex items-center gap-2.5 rounded-2xl bg-green-600 text-white px-6 py-3.5 font-bold shadow-lg shadow-green-600/25 hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStartingGame ? (
              <>
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Memulai...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                Mulai Kuis
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Participants grid list */}
      <div className="w-full max-w-4xl mt-8">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 text-left">
          Lobby Peserta ({participants.length})
        </h3>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card/40 border border-dashed rounded-3xl p-8 text-center italic">
            Menunggu murid memasukkan kode PIN...
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <AnimatePresence>
              {participants.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="glass-panel px-4 py-3 rounded-2xl border text-center font-bold text-sm text-foreground flex items-center gap-2 justify-center"
                >
                  <LazyImage
                    src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.display_name)}`}
                    alt="avatar"
                    className="h-6 w-6 rounded-full"
                  />
                  <span className="truncate">{p.display_name}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );

  const renderActiveQuestion = () => {
    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-semibold text-muted-foreground">Memuat soal kuis...</p>
        </div>
      );
    }

    const alphabet = ['A', 'B', 'C', 'D'];
    const colors = [
      'bg-red-500 hover:bg-red-600',
      'bg-blue-500 hover:bg-blue-600',
      'bg-yellow-500 hover:bg-yellow-600',
      'bg-green-500 hover:bg-green-600',
    ];

    return (
      <div className="space-y-6 max-w-5xl mx-auto py-4">
        {/* Top Question Info Banner */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
              Pertanyaan {activeSession!.current_question_index + 1} dari {questions.length}
            </span>
            <h2 className="text-2xl font-black text-foreground mt-1">
              <LatexRenderer content={currentQuestion.question_text} />
            </h2>
          </div>

          {/* Large Countdown Timer circle */}
          <div className="flex items-center gap-4">
            <div 
              id="host-question-timer"
              data-testid="host-question-timer"
              data-timer-value={timer}
              data-expires-at={activeSession?.question_expires_at || ''}
              data-server-offset={serverTimeOffset}
              className="h-16 w-16 rounded-full border-4 border-primary flex items-center justify-center text-xl font-black text-primary bg-primary/10">
              {timer}
            </div>
          </div>
        </div>

        {/* Media Preview Area */}
        {currentQuestion.media_url && (
          <div className="flex justify-center bg-card/50 rounded-3xl p-4 border max-h-[300px] overflow-hidden">
            {currentQuestion.media_type === 'image' && (
              <div 
                className="relative group cursor-zoom-in overflow-hidden rounded-2xl max-h-[250px]"
                onClick={() => {
                  setZoomImage(currentQuestion.media_url);
                  setZoomScale(1);
                  setZoomResetKey(prev => prev + 1);
                }}
              >
                <LazyImage 
                  src={currentQuestion.media_url} 
                  alt="Media soal" 
                  className="max-h-[250px] object-contain rounded-2xl group-hover:scale-[1.02] transition-transform duration-300" 
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                  <span className="text-white text-xs font-bold bg-zinc-900/80 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                    🔍 Klik untuk Memperbesar
                  </span>
                </div>
              </div>
            )}
            {currentQuestion.media_type === 'audio' && (
              <div className="flex items-center gap-3 py-6">
                <Volume2 className="h-8 w-8 text-primary animate-pulse" />
                <audio key={currentQuestion.media_url} controls src={getSafeMediaUrl(currentQuestion.media_url)} autoPlay />
              </div>
            )}
            {currentQuestion.media_type === 'video' && (
              <div className="flex items-center justify-center max-h-[250px] w-full">
                <video key={currentQuestion.media_url} controls src={getSafeMediaUrl(currentQuestion.media_url)} autoPlay className="max-h-[250px] rounded-2xl border bg-black" />
              </div>
            )}
            {currentQuestion.media_type === 'latex' && (
              <div className="py-8 text-2xl font-bold text-foreground">
                <LatexRenderer tex={currentQuestion.media_url} displayMode />
              </div>
            )}
          </div>
        )}

        {/* Live Submissions Tracker & Reveal Buttons */}
        <div className="flex items-center justify-between bg-card p-5 rounded-3xl border">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">
              {submissions.length} dari {participants.length} murid telah menjawab
            </span>
          </div>

          {activeSession!.current_stage === 'question' ? (
            <button
              onClick={handleRevealAnswer}
              className="rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5 text-xs shadow hover:bg-primary/95 transition"
            >
              Tampilkan Jawaban
            </button>
          ) : (
            <button
              onClick={handleShowLeaderboard}
              className="rounded-xl bg-green-600 text-white font-bold px-5 py-2.5 text-xs shadow hover:bg-green-700 transition"
            >
              Tampilkan Papan Skor
            </button>
          )}
        </div>

        {/* Option Grid / Matching Pairs */}
        {currentQuestion.question_type === 'matching' ? (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="bg-card p-6 rounded-3xl border border-border space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {activeSession!.current_stage === 'question_result' ? 'Kunci Pasangan Pencocokan' : 'Daftar Item Pencocokan'}
              </h3>
              
              {currentOptions.map((opt, idx) => (
                <div 
                  key={opt.id}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition duration-300 ${
                    activeSession!.current_stage === 'question_result' 
                      ? 'border-green-500 bg-green-500/10 text-green-750 dark:text-green-400 font-extrabold' 
                      : 'border-border bg-background/50 font-bold'
                  }`}
                >
                  <div className="flex items-center gap-3 text-foreground">
                    <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black">
                      {idx + 1}
                    </span>
                    <LatexRenderer content={opt.option_text} />
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs font-semibold">🔗 dipasangkan dengan</span>
                    <span className={`px-4 py-2 rounded-xl border text-xs font-black ${
                      activeSession!.current_stage === 'question_result' ? 'bg-green-600 text-white border-transparent' : 'bg-muted text-muted-foreground'
                    }`}>
                      {activeSession!.current_stage === 'question_result' ? opt.match_text : '??'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${currentQuestion.question_type === 'true_false' ? 'md:grid-cols-2 gap-6' : 'md:grid-cols-2 gap-4'}`}>
            {currentOptions.map((opt, idx) => {
              const isCorrect = opt.is_correct;
              const isTrue = opt.option_text.toLowerCase() === 'benar' || opt.option_text.toLowerCase() === 'true';

              let baseColor = colors[idx % 4];
              if (currentQuestion.question_type === 'true_false') {
                baseColor = isTrue ? 'bg-blue-600' : 'bg-red-600';
              }

              const optionColor = activeSession!.current_stage === 'question_result' 
                ? isCorrect ? 'bg-green-600 border-green-700 shadow-md scale-[1.01]' : 'opacity-40 bg-zinc-400' 
                : baseColor;

              return (
                <div
                  key={opt.id}
                  className={`rounded-2xl p-5 text-white font-bold text-lg flex items-center gap-4 transition duration-300 ${optionColor} ${
                    currentQuestion.question_type === 'true_false' ? 'py-8 flex-col justify-center text-center' : ''
                  }`}
                >
                  {currentQuestion.question_type === 'true_false' ? (
                    <>
                      <div className="text-4xl mb-1">{isTrue ? '👍' : '👎'}</div>
                      <div className="text-xl uppercase tracking-wider">{opt.option_text}</div>
                    </>
                  ) : (
                    <>
                      <div className="h-10 w-10 shrink-0 bg-white/20 rounded-xl flex items-center justify-center text-sm font-black">
                        {alphabet[idx % 4]}
                      </div>
                      <div className="text-base">
                        <LatexRenderer content={opt.option_text} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Answer Distribution Graph via Recharts */}
        {activeSession!.current_stage === 'question_result' && currentQuestion.question_type !== 'matching' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 rounded-3xl border space-y-4"
          >
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Distribusi Jawaban Siswa
            </h3>
            
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getChartData()}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Bar dataKey="Jumlah" radius={[8, 8, 0, 0]} maxBarSize={45}>
                    {getChartData().map((entry, index) => {
                      const baseColors = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isCorrect ? '#16a34a' : baseColors[index % 4]} 
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const renderLeaderboard = () => {
    const leaders = getLeaderboard();
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div className="text-center">
          <Award className="h-14 w-14 text-yellow-400 mx-auto mb-2 animate-bounce" />
          <h2 className="text-3xl font-black text-foreground">Papan Peringkat Sementara</h2>
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
            Pertanyaan {activeSession!.current_question_index + 1} Selesai
          </p>
        </div>

        <div className="glass-panel rounded-3xl shadow-md border overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b text-xs text-muted-foreground font-bold uppercase">
                <th className="px-6 py-4">Peringkat</th>
                <th className="px-6 py-4">Nama Murid</th>
                <th className="px-6 py-4 text-right">Skor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm font-semibold">
              {leaders.map((player, idx) => (
                <motion.tr
                  key={player.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="hover:bg-muted/5 transition"
                >
                  <td className="px-6 py-4 text-foreground">
                    <div className="flex items-center gap-3">
                      <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black ${
                        idx === 0 ? 'bg-yellow-400 text-yellow-950' : 
                        idx === 1 ? 'bg-zinc-300 text-zinc-800' : 
                        idx === 2 ? 'bg-amber-600 text-amber-50' : 'bg-muted text-muted-foreground'
                      }`}>
                        {idx + 1}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    <div className="flex items-center gap-2">
                      <LazyImage
                        src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(player.display_name)}`}
                        alt="avatar"
                        className="h-7 w-7 rounded-full"
                      />
                      <span>{player.display_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-primary font-bold">{player.score}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleNextStep}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-4 font-bold shadow-lg shadow-primary/20 hover:bg-primary/95 transition"
        >
          {activeSession!.current_question_index + 1 >= questions.length ? 'Selesaikan Kuis' : 'Soal Berikutnya'}
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    );
  };

  const renderPodium = () => {
    const liveLeaderboard = useLeaderboardStore.getState().leaderboard;
    const source = (participants.length > 0 && participants.some(p => p.score > 0))
      ? participants
      : (liveLeaderboard.length > 0 ? liveLeaderboard : participants);

    const sorted = [...source].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const timeA = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const timeB = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const first = sorted[0];
    const second = sorted[1];
    const third = sorted[2];

    return (
      <div className="max-w-3xl mx-auto py-8 text-center space-y-12">
        <div>
          <Award className="h-16 w-16 text-yellow-400 mx-auto animate-pulse mb-3" />
          <h2 className="text-4xl font-black text-foreground tracking-tight">Kuis Selesai!</h2>
          <p className="text-sm text-muted-foreground font-semibold">Selamat kepada para pemenang podium!</p>
          
          {quiz?.closing_text && (
            <div className="mt-6 bg-primary/5 rounded-2xl p-4 border border-primary/10 text-center max-w-md mx-auto">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Pesan Penutup</p>
              <p className="text-sm text-foreground italic font-medium">"{quiz.closing_text}"</p>
            </div>
          )}
        </div>

        {/* Podium visualization blocks */}
        <div className="flex items-end justify-center gap-4 h-64 px-4 pt-10">
          
          {/* Second Place */}
          {second && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 160, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="w-32 bg-slate-300 dark:bg-slate-700 border border-slate-400 rounded-t-3xl flex flex-col justify-end items-center pb-4 space-y-2 relative"
            >
              <div className="absolute -top-12 flex flex-col items-center">
                <LazyImage
                  src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(second.display_name)}`}
                  alt="2nd"
                  className="h-10 w-10 rounded-full border bg-background"
                />
                <span className="text-xs font-bold text-foreground mt-1 truncate max-w-[100px]">
                  {second.display_name}
                </span>
              </div>
              <span className="text-3xl font-black text-slate-600 dark:text-slate-400">2</span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{second.score} pts</span>
            </motion.div>
          )}

          {/* First Place */}
          {first && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 210, opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="w-36 bg-yellow-400 border border-yellow-500 rounded-t-3xl flex flex-col justify-end items-center pb-6 space-y-2 relative"
            >
              <div className="absolute -top-14 flex flex-col items-center">
                <span className="text-lg animate-bounce">👑</span>
                <LazyImage
                  src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(first.display_name)}`}
                  alt="1st"
                  className="h-12 w-12 rounded-full border-2 border-yellow-500 bg-background"
                />
                <span className="text-xs font-black text-foreground mt-1 truncate max-w-[120px]">
                  {first.display_name}
                </span>
              </div>
              <span className="text-4xl font-black text-yellow-900">1</span>
              <span className="text-xs font-black text-yellow-950">{first.score} pts</span>
            </motion.div>
          )}

          {/* Third Place */}
          {third && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 120, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="w-32 bg-amber-600 border border-amber-700 rounded-t-3xl flex flex-col justify-end items-center pb-4 space-y-2 relative"
            >
              <div className="absolute -top-12 flex flex-col items-center">
                <LazyImage
                  src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(third.display_name)}`}
                  alt="3rd"
                  className="h-10 w-10 rounded-full border bg-background"
                />
                <span className="text-xs font-bold text-foreground mt-1 truncate max-w-[100px]">
                  {third.display_name}
                </span>
              </div>
              <span className="text-2xl font-black text-amber-900">3</span>
              <span className="text-xs font-bold text-amber-900">{third.score} pts</span>
            </motion.div>
          )}
        </div>

        {/* Tabel Hasil Akhir / Peringkat Lengkap */}
        {sorted.length > 0 && (
          <div className="glass-panel rounded-3xl shadow-md border overflow-hidden max-w-2xl mx-auto text-left">
            <div className="px-6 py-4 bg-muted/20 border-b flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                🏆 Tabel Hasil Akhir
              </h3>
              <span className="text-xs text-muted-foreground font-semibold">
                Total {sorted.length} Peserta
              </span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b text-xs text-muted-foreground font-bold uppercase">
                  <th className="px-6 py-3.5">Peringkat</th>
                  <th className="px-6 py-3.5">Nama Murid</th>
                  <th className="px-6 py-3.5 text-right">Skor Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm font-semibold">
                {sorted.map((player, idx) => (
                  <tr key={player.id} className="hover:bg-muted/5 transition">
                    <td className="px-6 py-4 text-foreground">
                      <div className="flex items-center gap-3">
                        <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-yellow-400 text-yellow-950' : 
                          idx === 1 ? 'bg-zinc-300 text-zinc-800' : 
                          idx === 2 ? 'bg-amber-600 text-amber-50' : 'bg-muted text-muted-foreground'
                        }`}>
                          {idx + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-foreground">
                      <div className="flex items-center gap-2">
                        <LazyImage
                          src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(player.display_name)}`}
                          alt="avatar"
                          className="h-7 w-7 rounded-full"
                        />
                        <span>{player.display_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-primary font-bold">{player.score} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={() => navigate('/teacher/dashboard')}
          className="rounded-2xl bg-primary text-primary-foreground font-bold px-8 py-4 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Selesai & Kembali ke Dashboard
        </button>
      </div>
    );
  };


  const renderCountdown = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-panel p-12 rounded-3xl w-full max-w-md space-y-6 shadow-xl border-primary/20 flex flex-col items-center justify-center"
      >
        <span className="text-xs uppercase font-bold text-muted-foreground tracking-widest block mb-2 animate-pulse">
          Persiapan Soal {activeSession!.current_question_index + 1}
        </span>
        <motion.div
          key={countdown}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="text-8xl font-black text-primary font-mono"
        >
          {countdown > 0 ? countdown : '🏁'}
        </motion.div>
        <p className="text-sm text-foreground font-semibold">
          {countdown > 0 ? 'Harap bersiap!' : 'Memulai soal...'}
        </p>
      </motion.div>
    </div>
  );


  return (
    <div className="min-h-screen p-6">
      {renderConnectionToast()}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <h1 className="text-lg font-black text-foreground">SINESA Live Host</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={async () => {
                const confirmRes = await showConfirm(
                  'Keluar Sesi',
                  'Keluar dari sesi kuis sekarang? Sesi kuis akan dihentikan.',
                  'Ya, Keluar',
                  'Batal'
                );
                if (confirmRes.isConfirmed) {
                  navigate('/teacher/dashboard');
                }
              }}
              className="text-xs font-bold text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 px-3.5 py-2 rounded-xl transition"
            >
              Keluar Sesi
            </button>
          </div>
        </div>

        {hostState === 'loading' ? (
          <div className="text-center p-12 text-muted-foreground text-sm font-medium flex flex-col items-center justify-center gap-4 my-12">
            <div className="h-8 w-8 animate-spin border-4 border-primary border-t-transparent rounded-full" />
            <span>Memuat sesi kuis...</span>
          </div>
        ) : hostState === 'access_denied' ? (
          <div className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12">
            <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-rose-500/5">
              <ShieldAlert className="h-10 w-10 animate-bounce" />
            </div>
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
              HTTP 403
            </div>

            <h2 className="text-2xl font-black text-foreground mb-2">
              {errorInfo?.title || 'Akses Ditolak'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
              {errorInfo?.message || 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        ) : hostState === 'not_found' ? (
          <div className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12">
            <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-amber-500/5">
              <FileQuestion className="h-10 w-10 animate-pulse" />
            </div>
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
              HTTP 404
            </div>

            <h2 className="text-2xl font-black text-foreground mb-2">
              {errorInfo?.title || 'Sesi Tidak Ditemukan'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
              {errorInfo?.message || 'Sesi kuis tidak ditemukan.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        ) : hostState === 'error' ? (
          <div className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12">
            <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-destructive/10 text-destructive border border-destructive/20 shadow-destructive/5">
              <AlertTriangle className="h-10 w-10 animate-pulse" />
            </div>
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
              HTTP {errorInfo?.statusCode || 500}
            </div>

            <h2 className="text-2xl font-black text-foreground mb-2">
              {errorInfo?.title || 'Kesalahan Sistem'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
              {errorInfo?.message || 'Terjadi kesalahan server atau gangguan jaringan.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        ) : !activeSession ? (
          <div className="text-center p-12 text-muted-foreground text-sm font-medium flex flex-col items-center justify-center gap-4 my-12">
            <div className="h-8 w-8 animate-spin border-4 border-primary border-t-transparent rounded-full" />
            <span>Memuat sesi kuis...</span>
          </div>
        ) : activeSession.current_stage === 'waiting' ? (
          renderLobby()
        ) : activeSession.current_stage === 'finished' ? (
          renderPodium()
        ) : isCountdownActive ? (
          renderCountdown()
        ) : activeSession.current_stage === 'leaderboard' ? (
          renderLeaderboard()
        ) : (
          renderActiveQuestion()
        )}
      </div>

      {/* Diagnostics Panel */}
      <div className="fixed bottom-4 right-4 z-50">
        {!showDiagnostics ? (
          <button
            onClick={() => setShowDiagnostics(true)}
            className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center shadow-lg border border-zinc-700 text-xs font-bold transition"
            title="Buka Diagnostik"
          >
            🛠️
          </button>
        ) : (
          <div className="bg-zinc-950 text-zinc-350 rounded-2xl border border-zinc-850 p-4 w-72 shadow-2xl text-[11px] space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-white text-xs">SINESA Host Diagnostik</span>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-zinc-500 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Room PIN:</span>
                <span className="text-primary font-bold">{pinCode || '------'}</span>
              </div>
              <div className="flex justify-between">
                <span>Sess ID:</span>
                <span className="text-zinc-400 text-[10px] truncate max-w-[150px]" title={activeSession?.id}>
                  {activeSession?.id || 'null'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sess Status:</span>
                <span className={`font-bold ${
                  activeSession?.status === 'active' ? 'text-green-500' : 'text-amber-500'
                }`}>
                  {activeSession?.status || 'null'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Index Soal:</span>
                <span className="text-white font-bold">{activeSession?.current_question_index}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Soal:</span>
                <span className="text-zinc-400">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Siswa Bergabung:</span>
                <span className="text-white font-bold">{participants.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Jawaban Masuk:</span>
                <span className="text-white font-bold">{submissions.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Timer Sesi:</span>
                <span id="host-diagnostics-timer" className="text-white font-bold">{timer}s</span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-1.5 text-[10px]">
                <span>State Update:</span>
                <span className="text-green-400 font-bold">{lastPollTime}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Zoom Image Lightbox Modal */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md select-none"
            onClick={() => setZoomImage(null)}
          >
            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomImage(null);
              }}
              className="absolute top-6 right-6 p-3 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/50 backdrop-blur-md shadow-lg z-50 active:scale-95 transition-all text-sm font-bold"
              title="Tutup"
            >
              ✕
            </button>

            {/* Image Container */}
            <div 
              className="relative w-full h-full max-w-4xl max-h-[80vh] flex items-center justify-center p-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.stopPropagation();
                const delta = e.deltaY;
                setZoomScale(prev => {
                  const next = prev - delta * 0.002;
                  return Math.min(Math.max(0.5, next), 4);
                });
              }}
            >
              <div className="w-full h-full flex items-center justify-center">
                <motion.img
                  key={zoomResetKey}
                  src={zoomImage}
                  alt="Zoomed"
                  className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing"
                  drag
                  dragConstraints={{ left: -600, right: 600, top: -600, bottom: 600 }}
                  dragElastic={0.15}
                  dragMomentum={false}
                  animate={{ scale: zoomScale }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>
            </div>

            {/* Zoom Control Bar */}
            <div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/95 text-white border border-zinc-800 backdrop-blur-md rounded-2xl px-5 py-3 shadow-2xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.25))}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xl font-bold transition-all"
                title="Perkecil"
              >
                -
              </button>
              <span className="text-sm font-bold min-w-[60px] text-center text-zinc-300 font-mono">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => setZoomScale(prev => Math.min(4, prev + 0.25))}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xl font-bold transition-all"
                title="Perbesar"
              >
                +
              </button>
              <div className="h-6 w-px bg-zinc-800" />
              <button
                onClick={() => {
                  setZoomScale(1);
                  setZoomResetKey(prev => prev + 1);
                }}
                className="px-4 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xs font-bold transition-all"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
