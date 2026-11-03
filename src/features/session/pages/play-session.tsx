import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useQuizSession } from '@/shared/hooks/useQuizSession';
import { useQuestion } from '@/shared/hooks/useQuestion';
import { useParticipants } from '@/shared/hooks/useParticipants';
import { useAnswer } from '@/shared/hooks/useAnswer';
import { useFullscreen } from '@/shared/hooks/useFullscreen';
import { useAntiCheat } from '@/shared/hooks/useAntiCheat';
import { useNavigation } from '@/shared/hooks/useNavigation';
import { useTimer } from '@/shared/hooks/useTimer';
import { useCountdown } from '@/shared/hooks/useCountdown';
import { useUiStore } from '@/shared/stores/ui-store';
import { useSessionStore } from '@/features/session/stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';
import { LatexRenderer } from '@/shared/components/latex-renderer';
import { 
  Award, Volume2, Check, X, ArrowLeft, Heart, SkipForward, Send, 
  AlertCircle, Eye, Users, Clock, CheckCircle2, RefreshCw,
  XCircle, HelpCircle, Target
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { showConfirm, showError } from '@/shared/utils/swal';
import { sessionActions } from '@/features/session/stores/session-actions';
import { QuestionService } from '@/features/question/services/question.service';
import { SettingsService } from '@/features/settings/services/settings.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { useParticipantStore } from '@/features/participant/stores/participant-store';
import type { Option, Participant } from '@/types';
import { useLeaderboardStore } from '@/features/leaderboard/stores/leaderboard-store';
import { LazyImage } from '@/shared/components/lazy-image';
import { getSafeMediaUrl } from '@/shared/utils/media';

export const PlaySession: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { profile, isMock } = useAuthStore(useShallow(state => ({ profile: state.profile, isMock: state.isMock })));
  const pin = searchParams.get('pin');
  const name = searchParams.get('name');

  // Guest settings & inline join states (UAT-033)
  const [allowGuestParticipants, setAllowGuestParticipants] = useState<boolean | null>(null);
  const [inlinePin, setInlinePin] = useState(pin || '');
  const [inlineName, setInlineName] = useState(name || '');
  const [inlineJoining, setInlineJoining] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    SettingsService.getSystemSettings().then(res => {
      if (res.success && res.data) {
        const guestSetting = res.data.find(s => s.key === 'allow_guest_participants');
        setAllowGuestParticipants(!guestSetting || guestSetting.value !== 'false');
      } else {
        setAllowGuestParticipants(true);
      }
    }).catch(() => {
      setAllowGuestParticipants(true);
    });
  }, []);

  const { navigate } = useNavigation();
  const {
    session,
    quiz,
    realtimeStatus,
    joinSession,
    leaveSession,
    listenToSession,
    stopListening,
  } = useQuizSession();
  const {
    questions,
    currentQuestion,
    currentOptions,
    currentQuestionIndex,
    skipQuestion,
    setQuestionProgress,
  } = useQuestion();
  const {
    participant,
    participants,
    lives,
  } = useParticipants();

  // ponytail: Ensure lobby participants are loaded immediately when entering waiting stage
  useEffect(() => {
    if (session?.id && session.current_stage === 'waiting') {
      sessionActions.fetchParticipants(session.id);
    }
  }, [session?.id, session?.current_stage]);

  const {
    hasAnswered,
    isAnswerCorrect,
    scoreAwarded,
    skippedQuestions,
    questionStatus,
    answersMap,
    isCompleted,
    submitAnswer,
    fetchQuestionStats,
    fetchLeaderboard,
    submitSelfPacedAnswer,
    submitFinalQuiz,
  } = useAnswer();

  // ponytail: Synchronize participant stats and details when quiz completes or reaches finished screen
  useEffect(() => {
    if ((isCompleted || session?.current_stage === 'finished' || session?.status === 'completed') && participant?.id) {
      ParticipantService.getParticipantById(participant.id).then(res => {
        if (res.success && res.data) {
          useParticipantStore.setState({ participant: res.data as Participant });
        }
      }).catch(err => console.error('Failed to sync participant stats:', err));
    }
  }, [isCompleted, session?.current_stage, session?.status, participant?.id]);

  const { loading, error: playError } = useUiStore();

  console.log('UI_RENDERED', {
    role: 'student',
    stage: session?.current_stage,
    questionIndex: session?.current_question_index,
    hasQuestion: !!currentQuestion,
    hasParticipant: !!participant,
    timestamp: Date.now(),
  });

  const showFeedback = session?.current_stage === 'question_result';
  const setShowFeedback = (_val: boolean) => {}; // Dummy to support legacy/unreachable self-paced code compilation
  const [showReviewScreen, setShowReviewScreen] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
  const [shuffledMatches, setShuffledMatches] = useState<string[]>([]);
  const [isProgressing, setIsProgressing] = useState(false);

  // Mode Santai & Lives configuration
  const isCasualMode = (session?.quiz_mode === 'santai') || (quiz?.quiz_mode === 'santai');
  const maxLives = session?.lives_count ?? quiz?.lives_count ?? 3;
  const currentLives = typeof lives === 'number' ? Math.max(0, lives) : (typeof participant?.lives === 'number' ? Math.max(0, participant.lives) : maxLives);
  const isOutOfLives = isCasualMode && maxLives > 0 && currentLives <= 0;

  const renderLivesIndicator = () => {
    if (!isCasualMode || maxLives <= 0) return null;

    const isDepleted = currentLives <= 0;
    const isCritical = currentLives === 1;

    let containerStyle = 'bg-red-500/10 text-red-500 border-red-500/20';
    if (isDepleted) {
      containerStyle = 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40 ring-1 ring-red-500/25';
    } else if (isCritical) {
      containerStyle = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse';
    }

    return (
      <div 
        data-testid="lives-indicator"
        data-lives={currentLives}
        data-max-lives={maxLives}
        data-status={isDepleted ? 'depleted' : 'active'}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-sm transition-all duration-300 ${containerStyle}`}
      >
        <span className="text-[10px] font-black tracking-wider uppercase mr-0.5">
          Nyawa:
        </span>

        {maxLives <= 5 ? (
          <div className="flex items-center gap-1" data-testid="lives-hearts-container">
            {[...Array(maxLives)].map((_, i) => {
              const isActive = i < currentLives;
              return (
                <Heart
                  key={i}
                  data-active={isActive ? 'true' : 'false'}
                  className={`h-4.5 w-4.5 transition-all duration-300 ${
                    isActive
                      ? 'fill-red-500 text-red-500 drop-shadow-sm scale-100'
                      : 'fill-zinc-300/40 text-zinc-400 dark:fill-zinc-800 dark:text-zinc-600 opacity-60 scale-95'
                  }`}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1" data-testid="lives-counter-container">
            <Heart 
              className={`h-4.5 w-4.5 ${
                currentLives > 0 
                  ? 'fill-red-500 text-red-500 animate-pulse' 
                  : 'fill-zinc-300/40 text-zinc-400 dark:fill-zinc-800 dark:text-zinc-600'
              }`} 
            />
            <span className={`text-xs font-black ${currentLives > 0 ? 'text-red-500' : 'text-zinc-500'}`}>
              {currentLives} / {maxLives}
            </span>
          </div>
        )}

        {isDepleted && (
          <span 
            data-testid="badge-nyawa-habis"
            className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-sm animate-pulse"
          >
            Nyawa Habis
          </span>
        )}
      </div>
    );
  };

  const serverTimeOffset = session?.server_time ? Date.now() - session.server_time : 0;

  // Shared countdown hook for student side (synchronized with Host)
  const isCountdownStage = session?.current_stage === 'countdown';
  const countdown = useCountdown({
    expiresAt: session?.countdown_expires_at,
    serverTimeOffset,
    duration: session?.countdown_duration || 3,
    enabled: isCountdownStage || (session?.current_stage === 'question' && !!session?.countdown_expires_at),
  });
  const isCountdownActive = isCountdownStage || (session?.current_stage === 'question' && countdown > 0 && !!session?.countdown_expires_at);

  // useTimer hook replacement
  const localTimer = useTimer({
    expiresAt: session?.question_expires_at || null,
    serverTimeOffset,
    enabled: session?.current_stage === 'question' && !!currentQuestion && !isCompleted && !showReviewScreen && !isCountdownActive,
    onTimeUp: () => {
      if (!hasAnswered && currentQuestion) {
        const qType = currentQuestion.question_type || 'multiple_choice';
        if (qType === 'multiple_answer') {
          const ids = selectedOptionIdsRef.current || [];
          submitAnswer({ optionIds: ids, is_timeout: ids.length === 0 });
        } else if (qType === 'matching') {
          const matches = matchingAnswersRef.current || {};
          submitAnswer({ matchingAnswers: matches, is_timeout: Object.keys(matches).length === 0 });
        } else {
          submitAnswer({ optionId: '', is_timeout: true });
        }
      }
    }
  });

  // useAntiCheat hook replacement
  const {
    showWarningModal,
    warningReason,
    setShowWarningModal,
    triggerViolation,
  } = useAntiCheat({
    enabled: !!(session?.status === 'active' && !isCompleted && quiz?.anti_cheat_enabled),
  });

  // useFullscreen hook replacement
  const {
    isFullscreenOverlayActive,
    enterFullscreen: enterFullscreenMode,
  } = useFullscreen({
    required: !!(session?.status === 'active' && !isCompleted && quiz?.anti_cheat_enabled && quiz?.fullscreen_required),
    onExitFullscreen: () => {
      if (!isCompleted && session?.status === 'active') {
        triggerViolation('Keluar dari mode layar penuh (Fullscreen).');
      }
    }
  });

  // Component render and useEffect loggers for pembuktian debugging
  console.log('COMPONENT_RENDER', 'PlaySession', {
    stage: session?.current_stage,
    status: session?.status,
    qIndex: currentQuestionIndex,
    hasAnswered,
    hasCurrentQuestion: !!currentQuestion
  });
  console.log('PLAY_SESSION_RENDER', session?.current_stage);
  console.log('RE_RENDER', session?.current_stage);

  useEffect(() => {
    console.log('USE_EFFECT_STAGE', session?.current_stage);
  }, [session?.current_stage]);

  const handleProgressQuestion = async (nextIdx: number) => {
    if (isProgressing) return;
    setIsProgressing(true);
    try {
      await setQuestionProgress(nextIdx);
    } catch (err: any) {
      console.error('Failed to change question:', err);
      showError('Gagal', `Gagal memuat soal berikutnya: ${err.message || err}`);
    } finally {
      setIsProgressing(false);
    }
  };

  const selectedOptionIdsRef = useRef<string[]>([]);
  const matchingAnswersRef = useRef<Record<string, string>>({});
  const rejoinAttempted = useRef(false);

  // Zoom Media State
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomResetKey, setZoomResetKey] = useState<number>(0);

  // Diagnostics State
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [lastPollTime, setLastPollTime] = useState<string>('Never');

  // Final Review and Leaderboard States
  const [showPostSubmitReview, setShowPostSubmitReview] = useState(false);
  const [allQuestionsOptions, setAllQuestionsOptions] = useState<Record<string, Option[]>>({});
  const [loadingAllOptions, setLoadingAllOptions] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  
  // Realtime Question Statistics & Explanation States
  const [questionStats, setQuestionStats] = useState<{ correctCount: number; incorrectCount: number; totalCount: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showExplanationPanel, setShowExplanationPanel] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);

  useEffect(() => {
    selectedOptionIdsRef.current = selectedOptionIds;
  }, [selectedOptionIds]);

  useEffect(() => {
    matchingAnswersRef.current = matchingAnswers;
  }, [matchingAnswers]);

  // Synchronize options selection when loading/progressing questions
  useEffect(() => {
    if (currentQuestion) {
      // Clear or load saved answer state
      const savedAns = answersMap[currentQuestion.id];
      if (savedAns) {
        if (savedAns.selected_option_ids) {
          setSelectedOptionIds(savedAns.selected_option_ids);
        } else if (savedAns.selected_option_id) {
          setSelectedOptionIds([savedAns.selected_option_id]);
        } else {
          setSelectedOptionIds([]);
        }

        if (savedAns.matching_answers) {
          setMatchingAnswers(savedAns.matching_answers);
        } else {
          setMatchingAnswers({});
        }
      } else {
        setSelectedOptionIds([]);
        setMatchingAnswers({});
      }

      // Hide feedback popup for the new question
      setShowFeedback(false);
      
      if (currentQuestion.question_type === 'matching' && currentOptions) {
        const matches = currentOptions
          .map(o => o.match_text || '')
          .filter(t => t !== '')
          .sort(() => Math.random() - 0.5);
        setShuffledMatches(matches);
      }
    }
  }, [currentQuestion?.id, currentOptions, answersMap]);

  // Diagnostics sync
  useEffect(() => {
    if (!session?.id || isMock) return;
    const unsubscribe = useSessionStore.subscribe(() => {
      setLastPollTime(new Date().toLocaleTimeString());
    });
    return () => unsubscribe();
  }, [session?.id, isMock]);

  // Auto-Rejoin Session on page refresh (runs exactly once on mount if pin/name present)
  useEffect(() => {
    if (!pin || !name) return;
    if (rejoinAttempted.current) return;

    rejoinAttempted.current = true;
    if (!session && !loading) {
      console.log('play-session: Auto-rejoining session for', name);
      joinSession(pin, name, profile?.id);
    }
  }, [session, loading, pin, name, profile?.id]);

  // Resubscribe to realtime whenever session.id is available.
  // This handles React StrictMode double-mount: joinSession sets session.id in the store,
  // but the StrictMode unmount fires stopListening() on the first mount, leaving the
  // student disconnected. Keying on session?.id ensures we reconnect on the second mount.
  useEffect(() => {
    if (!session?.id || isMock) return;
    listenToSession(session.id);
    return () => {
      stopListening();
    };
  }, [session?.id, participant?.id, isMock]);

  // Fetch realtime question stats when student answers
  useEffect(() => {
    if (currentQuestion && hasAnswered && quiz?.show_question_statistics) {
      setLoadingStats(true);
      fetchQuestionStats(currentQuestion.id)
        .then((stats: any) => {
          setQuestionStats(stats);
        })
        .catch((err: any) => {
          console.error('Error fetching question stats:', err);
        })
        .finally(() => {
          setLoadingStats(false);
        });
    } else {
      setQuestionStats(null);
    }
  }, [currentQuestion?.id, hasAnswered, quiz?.show_question_statistics]);

  // Realtime Live Leaderboard Sync from Store
  const liveStoreLeaderboard = useLeaderboardStore(state => state.leaderboard);
  useEffect(() => {
    if (liveStoreLeaderboard && liveStoreLeaderboard.length > 0) {
      setLeaderboard(liveStoreLeaderboard);
    }
  }, [liveStoreLeaderboard]);

  // Fetch leaderboard when kuis is completed
  useEffect(() => {
    if ((isCompleted || session?.status === 'completed' || session?.current_stage === 'finished') && quiz?.show_leaderboard && quiz?.show_final_result) {
      setLoadingLeaderboard(true);
      fetchLeaderboard()
        .then((res: any) => {
          if (res && res.length > 0) {
            setLeaderboard(res);
          }
        })
        .catch((err: any) => {
          console.error('Error fetching leaderboard:', err);
        })
        .finally(() => {
          setLoadingLeaderboard(false);
        });
    }
  }, [isCompleted, session?.status, session?.current_stage, quiz?.show_leaderboard, quiz?.show_final_result]);

  // Ensure participant is marked completed when session finishes or completes
  useEffect(() => {
    if ((session?.status === 'completed' || session?.current_stage === 'finished') && participant && !participant.is_completed) {
      submitFinalQuiz();
    }
  }, [session?.status, session?.current_stage, participant?.is_completed]);

  // Fetch all options for post-submission review
  const fetchAllOptions = async () => {
    if (questions.length === 0) return;
    setLoadingAllOptions(true);
    const qIds = questions.map(q => q.id);
    if (isMock) {
      const map: Record<string, Option[]> = {};
      questions.forEach(q => {
        const mockOpts = localStorage.getItem(`options_${q.id}`);
        map[q.id] = mockOpts ? JSON.parse(mockOpts) : [];
      });
      setAllQuestionsOptions(map);
      setLoadingAllOptions(false);
    } else {
      try {
        const res = await QuestionService.getOptionsForQuestions(qIds);
        if (!res.success) throw res.error;
        const map: Record<string, Option[]> = {};
        res.data?.forEach((opt: Option) => {
          if (!map[opt.question_id]) map[opt.question_id] = [];
          map[opt.question_id].push(opt);
        });
        setAllQuestionsOptions(map);
      } catch (e) {
        console.error('Failed to fetch all options for review:', e);
      } finally {
        setLoadingAllOptions(false);
      }
    }
  };

  // Sound Synthesizer via Web Audio API
  const playSound = (type: 'correct' | 'incorrect') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'correct') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150.0, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) {
      console.warn('AudioContext failed:', e);
    }
  };

  // Prevent Refresh Guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (session?.status === 'active' && !isCompleted) {
        e.preventDefault();
        e.returnValue = 'Kuis sedang berjalan! Menyegarkan halaman akan membatalkan status partisipasi Anda.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session?.status, isCompleted]);

  




  // Play audio tones when answer feedback is rendered (never on timeout)
  useEffect(() => {
    const isCurrentTimeout = currentQuestion ? (questionStatus[currentQuestion.id] === 'skipped' || skippedQuestions.includes(currentQuestion.id)) : false;
    if (showFeedback && hasAnswered && isAnswerCorrect !== null && !isCurrentTimeout) {
      const showResult = quiz?.show_question_result !== false && quiz?.show_correct_answer !== false;
      if (showResult) {
        playSound(isAnswerCorrect ? 'correct' : 'incorrect');
        if (isAnswerCorrect) {
          confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
        }
      }
    }
  }, [showFeedback, hasAnswered, quiz?.show_question_result, quiz?.show_correct_answer, isAnswerCorrect, currentQuestion, questionStatus, skippedQuestions]);

  const handleSelectOption = (optionId: string) => {
    if (hasAnswered || localTimer <= 0) return;
    setSelectedOptionIds([optionId]);
  };

  const handleToggleMultipleOption = (optionId: string) => {
    if (hasAnswered || localTimer <= 0) return;
    setSelectedOptionIds(prev => 
      prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
    );
  };

  const handleSelectOptionLegacy = async (optionId: string) => {
    if (hasAnswered || localTimer <= 0) return;
    await submitAnswer(optionId);
  };

  // Submit Answer
  const handleSelfPacedSubmit = async () => {
    if (hasAnswered || !currentQuestion) return;

    const qType = currentQuestion.question_type || 'multiple_choice';
    if (qType === 'multiple_answer') {
      await submitSelfPacedAnswer({ optionIds: selectedOptionIds });
    } else if (qType === 'matching') {
      await submitSelfPacedAnswer({ matchingAnswers });
    } else {
      await submitSelfPacedAnswer({ optionId: selectedOptionIds[0] || '' });
    }

    setShowFeedback(true);
    const showResult = quiz?.show_question_result !== false && quiz?.show_correct_answer !== false;
    if (showResult) {
      playSound(isAnswerCorrect ? 'correct' : 'incorrect');
      if (isAnswerCorrect) {
        confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });
      }
    }
  };

  // Skip Question
  const handleSelfPacedSkip = async () => {
    if (hasAnswered || !currentQuestion) return;
    await skipQuestion(currentQuestion.id);
  };

  const handleExit = async () => {
    if (session?.status === 'active' && !isCompleted) {
      const confirmRes = await showConfirm(
        'Tinggalkan Kuis',
        'Apakah Anda yakin ingin meninggalkan kuis? Poin Anda saat ini akan dibatalkan.',
        'Ya, Keluar',
        'Batal'
      );
      if (!confirmRes.isConfirmed) return;
    }
    leaveSession();
    navigate(profile ? '/student/dashboard' : '/login');
  };

  // Rejection screen when guest access is disabled (UAT-033)
  if (!profile && allowGuestParticipants === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-destructive/25 space-y-4 text-center shadow-xl">
          <div className="h-14 w-14 bg-destructive/10 border border-destructive/30 rounded-2xl flex items-center justify-center mx-auto text-destructive">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">Akses Tamu Dinonaktifkan</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Partisipan tamu dinonaktifkan oleh Administrator. Silakan masuk menggunakan akun murid Anda untuk bergabung ke sesi kuis.
            </p>
          </div>
          <button
            id="btn-guest-denied-login"
            onClick={() => navigate('/login?role=student')}
            className="w-full py-3 bg-primary text-primary-foreground font-black rounded-xl text-xs hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            Masuk dengan Akun Murid
          </button>
        </div>
      </div>
    );
  }

  // Inline Join Form if user accessed /student/play-session without PIN/name (UAT-033)
  if (!session && (!pin || !name) && !playError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mesh p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full space-y-6 shadow-xl border border-primary/20">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-2">
              <span className="text-2xl">🎮</span>
            </div>
            <h2 className="text-xl font-black text-foreground">Gabung Kuis SINESA</h2>
            <p className="text-xs text-muted-foreground font-medium">
              Masukkan PIN Kuis dari guru dan nama tampilan Anda untuk langsung bergabung ke room kuis.
            </p>
          </div>

          {inlineError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{inlineError}</span>
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setInlineError(null);
              const cleanPin = inlinePin.trim();
              const cleanName = inlineName.trim();
              if (!cleanPin) {
                setInlineError('PIN Kuis wajib diisi.');
                return;
              }
              if (cleanPin.length < 5) {
                setInlineError('PIN Kuis minimal 5-6 angka/karakter.');
                return;
              }
              if (!cleanName) {
                setInlineError('Nama Tampilan wajib diisi.');
                return;
              }
              if (cleanName.length < 2) {
                setInlineError('Nama Tampilan minimal 2 karakter.');
                return;
              }
              setInlineJoining(true);
              const ok = await joinSession(cleanPin, cleanName, profile?.id);
              setInlineJoining(false);
              if (ok) {
                navigate(`/student/play-session?pin=${encodeURIComponent(cleanPin)}&name=${encodeURIComponent(cleanName)}`, { replace: true });
              } else {
                setInlineError(playError || 'Gagal bergabung ke sesi kuis. Pastikan PIN benar dan kuis sudah dibuka oleh guru.');
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                PIN Kuis (6 Digit)
              </label>
              <input
                id="inline-guest-pin"
                type="text"
                value={inlinePin}
                onChange={(e) => setInlinePin(e.target.value.toUpperCase())}
                placeholder="Contoh: 123456"
                maxLength={10}
                className="w-full rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-mono tracking-widest outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 text-center font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Nama Tampilan Anda
              </label>
              <input
                id="inline-guest-name"
                type="text"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                maxLength={50}
                className="w-full rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <button
              id="inline-guest-submit"
              type="submit"
              disabled={inlineJoining}
              className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/95 transition active:scale-95 disabled:opacity-50"
            >
              {inlineJoining ? 'Menghubungkan...' : 'Gabung ke Room Kuis'}
            </button>
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-xs text-muted-foreground hover:text-foreground font-semibold hover:underline"
              >
                Sudah punya akun? Masuk di sini
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground font-semibold">Menghubungkan ke server kuis SINESA...</p>
        </div>
      </div>
    );
  }

  // Not yet joined — show loading instead of completed screen (Bug 5 fix)
  if (!session && !playError) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground font-semibold">Memuat sesi kuis...</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (playError) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh p-4">
        <div className="glass-panel p-6 rounded-3xl max-w-md w-full border border-destructive/25 space-y-4 text-center shadow-xl">
          <div className="h-12 w-12 bg-destructive/10 border border-destructive/30 rounded-full flex items-center justify-center mx-auto text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Gagal Menghubungkan</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {playError}
          </p>
          <button
            onClick={() => {
              leaveSession();
              navigate(profile ? '/student/dashboard' : '/login');
            }}
            className="w-full py-3 bg-foreground text-background font-black rounded-xl text-xs hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            {profile ? 'Kembali ke Dashboard' : 'Kembali ke Halaman Masuk'}
          </button>
        </div>
      </div>
    );
  }

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
    // CONNECTED -> Banner hidden!
    return null;
  };

  // 1. Lobby Waiting Screen
  console.log('[SYNC] PlaySession: Render with stage =', session?.current_stage, 'questionIdx =', session?.current_question_index);
  if (session?.current_stage === 'waiting') {
    const roomParticipants = participants.filter(p => !p.session_id || p.session_id === session.id);

    return (
      <div className="flex flex-col items-center justify-start min-h-[90vh] text-center p-4 py-8 max-w-3xl mx-auto space-y-6">
        {renderConnectionToast()}
        
        {/* Current Student Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-6 sm:p-8 rounded-3xl w-full max-w-md space-y-5 shadow-xl border-amber-500/10"
        >
          <div className="relative inline-block">
            <LazyImage
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(participant?.display_name || 'Murid')}`}
              alt="avatar"
              className="h-20 w-20 rounded-full border-2 border-primary/20 bg-background mx-auto"
            />
            <span className="absolute bottom-0 right-0 text-xl">🎮</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black text-foreground">{participant?.display_name}</h2>
            <p className="text-xs text-muted-foreground font-semibold">Berhasil bergabung ke room kuis</p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase mt-2 bg-primary/15 text-primary border border-primary/20">
              {session.quiz_mode === 'santai' ? '🎮 Mode Santai / Adventure' : '🔒 Mode Serius (Ujian)'}
            </div>
          </div>

          {quiz?.opening_text && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Pesan Pembuka</p>
              <p className="text-xs text-foreground italic font-medium">"{quiz.opening_text}"</p>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 animate-pulse">
            <p className="text-xs font-semibold text-primary">
              Tunggu guru menekan tombol "Mulai" untuk membuka soal pertama...
            </p>
          </div>

          <button
            onClick={handleExit}
            className="text-xs font-bold text-destructive hover:underline"
          >
            Batal & Keluar Lobby
          </button>
        </motion.div>

        {/* Full Lobby Participants List on Student Side */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-2xl space-y-4"
        >
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary animate-pulse" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Peserta di Room ({roomParticipants.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border">
              {roomParticipants.length === 1 ? '1 Peserta Aktif' : `${roomParticipants.length} Peserta Aktif`}
            </span>
          </div>

          {loading && roomParticipants.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl border text-center space-y-3">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-muted-foreground">Memuat daftar peserta...</p>
            </div>
          ) : roomParticipants.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl border border-dashed text-center">
              <p className="text-xs text-muted-foreground italic">
                Belum ada peserta lain. Kamu adalah yang pertama bergabung di room kuis ini!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <AnimatePresence>
                {roomParticipants.map((p) => {
                  const isMe = p.id === participant?.id;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                      className={`glass-panel px-3.5 py-2.5 rounded-2xl border text-center font-bold text-xs flex items-center gap-2 justify-center transition-all ${
                        isMe
                          ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30'
                          : 'text-foreground hover:bg-muted/30'
                      }`}
                    >
                      <LazyImage
                        src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.display_name)}`}
                        alt="avatar"
                        className="h-6 w-6 rounded-full flex-shrink-0"
                      />
                      <span className="truncate max-w-[100px]">{p.display_name}</span>
                      {isMe && (
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-black flex-shrink-0">
                          Kamu
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // 1.5. Countdown Screen (Synchronized 3-2-1 shared with Host)
  if (isCountdownActive) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-mesh p-4">
        {renderConnectionToast()}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-12 rounded-3xl w-full max-w-md space-y-6 shadow-xl border-primary/20 flex flex-col items-center justify-center text-center"
        >
          <span className="text-xs uppercase font-bold text-muted-foreground tracking-widest block mb-2 animate-pulse">
            Persiapan Soal {(session?.current_question_index ?? 0) + 1}
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
  }

  // 1.6. Leaderboard Wait Screen
  if (session?.current_stage === 'leaderboard') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-mesh p-4">
        {renderConnectionToast()}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-8 rounded-3xl w-full max-w-md space-y-6 shadow-xl border-primary/20 text-center flex flex-col items-center justify-center"
        >
          <div className="h-16 w-16 bg-primary/10 border border-primary/30 rounded-full flex items-center justify-center text-3xl animate-bounce">
            📊
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-foreground">Papan Skor Sedang Ditampilkan</h2>
            <p className="text-xs text-muted-foreground font-semibold">
              Perhatikan layar Guru untuk melihat posisi peringkat kelas!
            </p>
          </div>
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl w-full flex justify-between items-center">
            <span className="text-xs font-bold text-muted-foreground">Skor Anda saat ini:</span>
            <span className="text-sm font-black text-primary">{participant?.score ?? 0} Pts</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ============================================
  // POST-SUBMISSION REVIEW SCREEN
  // ============================================
  if (showPostSubmitReview) {
    const showCorrectAnswer = quiz?.show_correct_answer !== false;
    const showExplanationSetting = quiz?.show_explanation !== false;

    return (
      <div className="min-h-screen flex flex-col p-4 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <button
            onClick={() => setShowPostSubmitReview(false)}
            className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Hasil Akhir
          </button>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black text-foreground">Detail Review Kuis</h2>
          </div>
        </div>

        {loadingAllOptions ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground font-semibold">Memuat pembahasan dan pilihan jawaban...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => {
              const ans = answersMap[q.id];
              const status = questionStatus[q.id] || (skippedQuestions.includes(q.id) ? 'skipped' : (ans ? 'answered' : 'unanswered'));
              const isTimeout = status === 'skipped' || skippedQuestions.includes(q.id) || !!(ans as any)?.is_timeout;
              const isCorrect = !isTimeout && (ans?.is_correct || false);
              const opts = allQuestionsOptions[q.id] || [];

              // Status badge (Tidak Dijawab if skipped/timeout or unanswered)
              let badge = (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Tidak Dijawab
                </span>
              );

              if (isTimeout || status === 'skipped') {
                badge = (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    Tidak Dijawab
                  </span>
                );
              } else if (status === 'answered' && ans && !(ans as any).is_timeout) {
                if (showCorrectAnswer) {
                  badge = isCorrect ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-green-500/10 text-green-500 border border-green-500/20">
                      Benar
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500/10 text-red-500 border border-red-500/20">
                      Salah
                    </span>
                  );
                } else {
                  badge = (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary/10 text-primary border border-primary/20">
                      Jawaban Tersimpan
                    </span>
                  );
                }
              }

              return (
                <div key={q.id} className="glass-panel p-6 rounded-3xl border border-border/60 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-extrabold text-base text-foreground leading-relaxed">
                      Soal {idx + 1}. <LatexRenderer content={q.question_text} />
                    </h3>
                    <div className="shrink-0">{badge}</div>
                  </div>

                  {q.media_url && (
                    <div className="flex justify-center bg-card/40 rounded-2xl p-3 border max-h-[180px] overflow-hidden">
                      {q.media_type === 'image' && (
                        <LazyImage src={q.media_url} alt="soal media" className="max-h-[150px] object-contain rounded-lg" />
                      )}
                      {q.media_type === 'audio' && (
                        <audio key={q.media_url} controls src={getSafeMediaUrl(q.media_url)} className="scale-90" />
                      )}
                      {q.media_type === 'video' && (
                        <video key={q.media_url} controls src={getSafeMediaUrl(q.media_url)} className="max-h-[150px] rounded-lg" />
                      )}
                      {q.media_type === 'latex' && (
                        <LatexRenderer tex={q.media_url} displayMode />
                      )}
                    </div>
                  )}

                  {/* Options List */}
                  <div className="space-y-2">
                    {q.question_type === 'matching' ? (
                      <div className="space-y-2 bg-muted/30 p-4 rounded-2xl border">
                        {opts.map((opt) => {
                          const chosenMatch = ans?.matching_answers?.[opt.id] || '';
                          const isMatchedCorrect = chosenMatch === opt.match_text;
                          
                          let matchRowStyle = 'border-border/50 bg-background/50';
                          if (showCorrectAnswer && status === 'answered') {
                            matchRowStyle = isMatchedCorrect 
                              ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400' 
                              : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400';
                          }

                          return (
                            <div key={opt.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-xl border text-xs font-semibold ${matchRowStyle}`}>
                              <span><LatexRenderer content={opt.option_text} /></span>
                              <div className="flex items-center gap-1.5 mt-1 sm:mt-0 text-[11px]">
                                <span className="text-muted-foreground">Pasangan Anda:</span>
                                <span className="font-bold">{chosenMatch || '(Belum dipasangkan)'}</span>
                                {showCorrectAnswer && !isMatchedCorrect && (
                                  <span className="text-green-600 dark:text-green-400 font-extrabold ml-1.5">
                                    (Kunci: {opt.match_text})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {opts.map((opt) => {
                          const isSelected = ans?.selected_option_id === opt.id || ans?.selected_option_ids?.includes(opt.id);
                          
                          let optStyle = 'border-border/50 bg-background/40 text-muted-foreground';
                          
                          if (showCorrectAnswer) {
                            if (opt.is_correct) {
                              optStyle = 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400 font-bold';
                            } else if (isSelected) {
                              optStyle = 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400 font-bold';
                            }
                          } else if (isSelected) {
                            optStyle = 'border-primary bg-primary/10 text-foreground font-bold';
                          }

                          return (
                            <div key={opt.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border text-xs ${optStyle}`}>
                              <div className={`h-5 w-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                              }`}>
                                {isSelected ? '✓' : '•'}
                              </div>
                              <span className="truncate"><LatexRenderer content={opt.option_text} /></span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Explanation card */}
                  {showExplanationSetting && q.explanation && (
                    <div className="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">💡 Pembahasan</p>
                      <div className="text-xs text-foreground italic font-medium leading-relaxed"><LatexRenderer content={q.explanation} /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2. Play session ended (Results/Podium screen)
  if (isCompleted || session?.current_stage === 'finished' || session?.status === 'completed') {
    console.log('[SYNC] PlaySession: Rendering completed/finished screen');
    const isGameOver = isOutOfLives;
    const showFinalResultSetting = quiz?.show_final_result !== false;
    const showLeaderboardSetting = quiz?.show_leaderboard !== false;
    const showAnswerReviewSetting = quiz?.show_answer_review !== false;

    const totalQuestions = participant?.stats?.total_questions ?? questions.length;
    const localCorrect = Object.values(answersMap).filter(a => a.is_correct).length;
    const correctCount = participant?.stats?.correct_count ?? (participant?.total_correct ?? localCorrect);
    const localIncorrect = Object.values(answersMap).filter(a => !a.is_correct).length;
    const incorrectCount = participant?.stats?.incorrect_count ?? (participant?.total_incorrect ?? localIncorrect);
    const calculatedUnanswered = Math.max(0, totalQuestions - (correctCount + incorrectCount));
    const unansweredCount = participant?.stats?.unanswered_count ?? (participant?.total_unanswered ?? calculatedUnanswered);
    const accuracyPercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-[90vh] text-center p-4 max-w-md mx-auto space-y-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-8 rounded-3xl w-full space-y-6 shadow-xl border-border"
        >
          {isGameOver ? (
            <div className="space-y-2">
              <span className="text-5xl block animate-bounce">💀</span>
              <h2 className="text-3xl font-black text-destructive tracking-tight uppercase">Game Over</h2>
              <p className="text-xs text-muted-foreground font-semibold">Nyawa Anda habis! Coba lagi di lain waktu.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Award className="h-16 w-16 text-yellow-400 mx-auto animate-bounce" />
              <h2 className="text-2xl font-black text-foreground">Kuis Selesai!</h2>
              <p className="text-xs text-muted-foreground font-semibold">Anda telah menyelesaikan sesi kuis ini</p>
            </div>
          )}

          {quiz?.closing_text && !isGameOver && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Pesan Penutup</p>
              <p className="text-xs text-foreground italic font-medium">"{quiz.closing_text}"</p>
            </div>
          )}

          <div className="border-y border-border py-5 space-y-4 text-left w-full" data-testid="quiz-result-summary">
            {showFinalResultSetting ? (
              <>
                {/* Hero Stats: Final Score & Accuracy */}
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    data-testid="stat-final-score" 
                    className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-center"
                  >
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-primary mb-0.5">
                      Skor Akhir
                    </span>
                    <span className="text-2xl font-black text-foreground">
                      {participant?.score || 0}
                    </span>
                  </div>

                  <div 
                    data-testid="stat-accuracy" 
                    className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center"
                  >
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 mb-0.5">
                      Akurasi
                    </span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {accuracyPercent}%
                    </span>
                  </div>
                </div>

                {/* 3-Column Breakdown: Benar, Salah, Tidak Dijawab */}
                <div className="grid grid-cols-3 gap-2">
                  <div 
                    data-testid="stat-correct-count" 
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-center"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Benar</span>
                    </div>
                    <span className="text-lg font-black text-foreground">
                      {correctCount}
                    </span>
                  </div>

                  <div 
                    data-testid="stat-incorrect-count" 
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/15 text-center"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 mb-0.5">
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Salah</span>
                    </div>
                    <span className="text-lg font-black text-foreground">
                      {incorrectCount}
                    </span>
                  </div>

                  <div 
                    data-testid="stat-unanswered-count" 
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-zinc-500/5 border border-zinc-500/15 text-center"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-0.5">
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>Tidak Dijawab</span>
                    </div>
                    <span className="text-lg font-black text-foreground">
                      {unansweredCount}
                    </span>
                  </div>
                </div>

                {/* Secondary details: Total Soal & Lives indicator */}
                <div className="flex justify-between items-center text-xs font-semibold pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Total Soal Dinilai:</span>
                  <span className="text-foreground font-bold" data-testid="stat-total-questions">
                    {totalQuestions} Soal
                  </span>
                </div>

                {isCasualMode && maxLives > 0 && (
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-muted-foreground">Sisa Nyawa:</span>
                    <div>
                      {renderLivesIndicator()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-center mb-2">
                <p className="text-xs font-semibold text-primary leading-relaxed">
                  Kuis Selesai! Jawaban Anda telah tersimpan. Detail nilai hanya dapat dilihat oleh Guru.
                </p>
              </div>
            )}
          </div>

          {/* Review Button */}
          {showAnswerReviewSetting && (
            <button
              onClick={() => {
                setShowPostSubmitReview(true);
                fetchAllOptions();
              }}
              className="w-full rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 border border-zinc-700 active:scale-95 transition shadow-md flex items-center justify-center gap-2"
            >
              <Eye className="h-4.5 w-4.5" />
              Lihat Review Jawaban
            </button>
          )}

          <button
            onClick={handleExit}
            className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-yellow-950 font-black py-4 shadow-lg transition"
          >
            Kembali ke Dashboard
          </button>
        </motion.div>

        {/* Realtime Leaderboard Podium / Rankings */}
        {showLeaderboardSetting && showFinalResultSetting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 rounded-3xl w-full space-y-4 shadow-xl border-border text-left"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-xs font-black uppercase text-primary tracking-wider flex items-center gap-1.5">
                🏆 Leaderboard Room
              </h3>
              <span className="text-[10px] text-muted-foreground font-semibold">Realtime</span>
            </div>
            
            {loadingLeaderboard ? (
              <div className="py-8 text-center text-xs font-semibold text-muted-foreground animate-pulse">
                Memuat peringkat peserta...
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-muted-foreground">
                Belum ada peserta lain.
              </div>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {leaderboard.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const bgColors = [
                    'bg-amber-500/10 border-amber-500/20 text-amber-500',   // 1st Gold
                    'bg-zinc-400/10 border-zinc-400/20 text-zinc-400',       // 2nd Silver
                    'bg-orange-500/10 border-orange-500/20 text-orange-500', // 3rd Bronze
                  ];
                  const medalIcons = ['🥇', '🥈', '🥉'];
                  
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition ${
                        p.id === participant?.id 
                          ? 'bg-primary/20 border-primary shadow-sm scale-102 font-black' 
                          : isTop3 ? bgColors[idx] : 'bg-background/40 border-border/50 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black w-6 text-center">
                          {isTop3 ? medalIcons[idx] : `${idx + 1}`}
                        </span>
                        <span className="text-xs font-bold truncate max-w-[150px]">{p.display_name}</span>
                        {p.id === participant?.id && (
                          <span className="text-[9px] uppercase font-extrabold bg-primary/25 text-primary px-1.5 py-0.5 rounded-full border border-primary/25">
                            Anda
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold">{p.score} Pts</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </div>
    );
  }

  // 3. Question active layout
  if (!currentQuestion) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">Memuat soal kuis...</p>
        </div>
      </div>
    );
  }

  const isSelfPaced = false; // Always host-paced for synchronized gameplay
  const colors = [
    'option-button-red',
    'option-button-blue',
    'option-button-yellow',
    'option-button-green',
  ];
  const shapes = ['▲', '◆', '●', '■'];

  // ============================================
  // RENDER REVIEW SCREEN
  // ============================================
  if (showReviewScreen && isSelfPaced) {
    const answeredCount = Object.values(questionStatus).filter(s => s === 'answered').length;
    const skippedCount = Object.values(questionStatus).filter(s => s === 'skipped').length;
    const unansweredCount = questions.length - answeredCount - skippedCount;

    return (
      <div className="min-h-screen flex flex-col p-4 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black text-foreground">Review Jawaban Kuis</h2>
          </div>
          <button
            onClick={() => setShowReviewScreen(false)}
            className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            ✕ Tutup Review
          </button>
        </div>

        {/* Status statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-panel p-4 rounded-2xl text-center border-green-500/20 bg-green-500/5">
            <span className="text-[10px] font-black uppercase text-green-600 block">Dijawab</span>
            <span className="text-2xl font-black text-green-500">{answeredCount}</span>
          </div>
          <div className="glass-panel p-4 rounded-2xl text-center border-yellow-500/20 bg-yellow-500/5">
            <span className="text-[10px] font-black uppercase text-yellow-600 block">Dilewati</span>
            <span className="text-2xl font-black text-yellow-500">{skippedCount}</span>
          </div>
          <div className="glass-panel p-4 rounded-2xl text-center border-zinc-700/25 bg-zinc-500/5">
            <span className="text-[10px] font-black uppercase text-zinc-400 block">Belum Diisi</span>
            <span className="text-2xl font-black text-muted-foreground">{unansweredCount}</span>
          </div>
        </div>

        {/* Detailed Question Review List */}
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {questions.map((q, idx) => {
            const status = questionStatus[q.id] || 'unanswered';
            let statusLabel = 'Belum Dijawab';
            let statusStyle = 'border-border bg-background/40 text-muted-foreground';

            if (status === 'answered') {
              statusLabel = 'Sudah Dijawab';
              statusStyle = 'border-green-500/30 bg-green-500/5 text-green-500';
            } else if (status === 'skipped') {
              statusLabel = 'Dilewati';
              statusStyle = 'border-yellow-500/30 bg-yellow-500/5 text-yellow-500';
            }

            const isLocked = status === 'answered';

            return (
              <div 
                key={q.id}
                className={`p-4 rounded-2xl border flex items-center justify-between transition ${statusStyle}`}
              >
                <div className="space-y-1 pr-4">
                  <h4 className="font-extrabold text-sm text-foreground">
                    Soal {idx + 1}. {q.question_text.length > 60 ? q.question_text.slice(0, 60) + '...' : q.question_text}
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
                    {statusLabel}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setShowReviewScreen(false);
                    handleProgressQuestion(idx);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                    isLocked || isProgressing
                      ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-50' 
                      : 'bg-primary text-primary-foreground hover:scale-102 active:scale-98'
                  }`}
                  disabled={isLocked || isProgressing}
                >
                  {isLocked ? 'Terkunci' : 'Kerjakan'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Confirm Submit Action */}
        <div className="glass-panel p-5 rounded-3xl border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
              Pastikan Anda telah mengisi semua pertanyaan. Setelah menekan tombol kirim kuis, Anda tidak dapat mengubah jawaban Anda lagi.
            </p>
          </div>
          <button
            onClick={async () => {
              const confirmRes = await showConfirm(
                'Kirim Kuis Akhir',
                'Apakah Anda yakin ingin menyelesaikan kuis ini dan mengirim skor akhir?',
                'Kirim Sekarang',
                'Batal'
              );
              if (confirmRes.isConfirmed) {
                await submitFinalQuiz();
              }
            }}
            className="w-full sm:w-auto shrink-0 bg-green-600 hover:bg-green-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg transition"
          >
            Kirim Kuis Akhir
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // PLAY LAYOUT (SERIUS OR SANTAI OR LEGACY HOST-PACED)
  // ============================================
  return (
    <div className="min-h-screen flex flex-col justify-between p-4">
      {renderConnectionToast()}
      {/* Top bar info */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExit}
            className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground mr-1 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Keluar
          </button>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
            isCasualMode ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-primary/10 text-primary border-primary/20'
          }`}>
            {isCasualMode ? '🕹️ Casual' : '🎓 Serius'}
          </span>
          {quiz?.anti_cheat_enabled && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500/15 text-red-500 border border-red-500/25 animate-pulse shadow-sm">
              🛡️ Anti-Cheat | Pelanggaran: {participant?.violation_count || 0}/{session?.auto_submit_on_violation ?? 3}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          {renderLivesIndicator()}
          <span className="text-sm font-extrabold text-primary">
            {participant?.display_name}
            {quiz?.show_score_per_question !== false && ` - ${participant?.score} Pts`}
          </span>
        </div>

        {/* Timer status */}
        <div 
          id="student-question-timer"
          data-testid="student-question-timer"
          data-timer-value={localTimer}
          data-expires-at={session?.question_expires_at || ''}
          data-server-offset={serverTimeOffset}
          className="h-10 w-10 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center font-black text-primary text-sm shadow shrink-0">
          {localTimer}s
        </div>
      </div>

      {/* Progress Bar timer */}
      <div className="w-full bg-muted h-2 rounded-full overflow-hidden mb-6">
        <div 
          className="h-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, (localTimer / ((currentQuestion?.duration || (currentQuestion as any)?.timer || quiz?.duration_per_question || 30))) * 100))}%` }}
        />
      </div>

      {/* Visual Notice Banner when Nyawa Habis */}
      {isOutOfLives && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="nyawa-habis-banner"
          className="w-full max-w-2xl mx-auto mb-6 p-4 rounded-2xl bg-red-500/15 border-2 border-red-500/30 text-red-700 dark:text-red-300 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 font-black shadow-md text-lg">
              💔
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h4 className="font-black text-sm uppercase tracking-wide text-red-600 dark:text-red-400">
                  Nyawa Habis
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white uppercase tracking-wider">
                  Game Over
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                Anda telah kehabisan nyawa. Kesempatan menjawab soal pada sesi ini telah berakhir.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {[...Array(Math.min(maxLives, 5))].map((_, i) => (
              <Heart key={i} className="h-4.5 w-4.5 fill-zinc-300/40 text-zinc-400 dark:fill-zinc-800 dark:text-zinc-600 opacity-60" />
            ))}
          </div>
        </motion.div>
      )}

      {/* SELF-PACED QUESTIONS NAVIGATION PANEL */}
      {isSelfPaced && (
        <div className="max-w-4xl mx-auto w-full mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
              Kemajuan Ujian ({currentQuestionIndex + 1} dari {questions.length})
            </span>
            <button
              onClick={() => setShowReviewScreen(true)}
              className="text-[10px] font-black uppercase text-primary tracking-wider hover:underline"
            >
              📝 Ringkasan & Review
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-h-16 overflow-y-auto bg-card/30 p-2.5 rounded-2xl border">
            {questions.map((q, idx) => {
              const status = questionStatus[q.id] || 'unanswered';
              const isActive = idx === currentQuestionIndex;
              const isLocked = false;

              let btnStyle = 'border-border text-muted-foreground bg-background/30';

              if (status === 'answered') {
                btnStyle = 'border-green-500/40 bg-green-500/10 text-green-500 font-extrabold';
              } else if (status === 'skipped') {
                btnStyle = 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500 font-extrabold';
              }

              if (isActive) {
                btnStyle = `${btnStyle} ring-2 ring-primary border-primary scale-105 font-black text-primary bg-primary/5`;
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    handleProgressQuestion(idx);
                  }}
                  disabled={isLocked || isProgressing}
                  className={`h-9 w-9 text-xs rounded-xl flex items-center justify-center border font-bold transition duration-200 outline-none ${btnStyle} ${
                    (isLocked || isProgressing) ? 'opacity-40 cursor-not-allowed border-dashed' : 'hover:bg-muted active:scale-95'
                  }`}
                  title={`Soal ${idx + 1} (${status})`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Question presentation area */}
      <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full text-center space-y-6">
        <h2 className="text-xl md:text-2xl font-black text-foreground leading-relaxed">
          <LatexRenderer content={currentQuestion?.question_text} />
        </h2>

        {currentQuestion?.media_url && (
          <div className="flex justify-center bg-card/65 rounded-3xl p-4 border max-h-[220px] overflow-hidden">
            {currentQuestion.media_type === 'image' && (
              <div 
                className="relative group cursor-zoom-in overflow-hidden rounded-xl max-h-[185px]"
                onClick={() => {
                  setZoomImage(currentQuestion.media_url);
                  setZoomScale(1);
                  setZoomResetKey(prev => prev + 1);
                }}
              >
                <LazyImage 
                  src={currentQuestion.media_url} 
                  alt="soal" 
                  className="max-h-[185px] object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300" 
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                  <span className="text-white text-[10px] font-bold bg-zinc-900/80 px-2.5 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                    🔍 Klik untuk Memperbesar
                  </span>
                </div>
              </div>
            )}
            {currentQuestion.media_type === 'audio' && (
              <div className="flex items-center gap-3 py-4">
                <Volume2 className="h-7 w-7 text-primary animate-pulse" />
                <audio key={currentQuestion.media_url} controls src={getSafeMediaUrl(currentQuestion.media_url)} autoPlay />
              </div>
            )}
            {currentQuestion.media_type === 'video' && (
              <div className="flex items-center justify-center max-h-[185px] w-full">
                <video key={currentQuestion.media_url} controls src={getSafeMediaUrl(currentQuestion.media_url)} autoPlay className="max-h-[185px] rounded-xl border bg-black" />
              </div>
            )}
            {currentQuestion.media_type === 'latex' && (
              <div className="py-6 text-xl font-bold text-foreground">
                <LatexRenderer tex={currentQuestion.media_url} displayMode />
              </div>
            )}
          </div>
        )}
        
        {/* Legacy Mode: Waiting for host message overlay */}
        {!isSelfPaced && hasAnswered && localTimer > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary/10 border border-primary/20 rounded-2xl p-4 max-w-md mx-auto"
          >
            <p className="text-sm font-extrabold text-primary animate-pulse">
              🎮 Jawaban Anda sudah terkirim!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Menunggu peserta lain selesai menjawab atau timer berakhir...
            </p>
          </motion.div>
        )}
      </div>

      {/* Interactive feedback overlaid popup */}
      <AnimatePresence>
        {showFeedback && (() => {
          const currentQId = currentQuestion?.id;
          const currentStatus = currentQId ? questionStatus[currentQId] : undefined;
          const isTimeoutQuestion = currentStatus === 'skipped' || (currentQId ? skippedQuestions.includes(currentQId) : false);

          return (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className={`fixed inset-x-4 bottom-4 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-md glass-panel p-6 rounded-3xl shadow-2xl border-2 flex flex-col gap-4 z-50 ${
                quiz?.show_question_result !== false && quiz?.show_correct_answer !== false
                  ? (isTimeoutQuestion
                      ? 'border-amber-500 bg-amber-500/10 backdrop-blur-md'
                      : isAnswerCorrect
                      ? 'border-green-500 bg-green-50/15 backdrop-blur-md'
                      : 'border-red-500 bg-red-50/15 backdrop-blur-md')
                  : 'border-primary bg-primary/10 backdrop-blur-md'
              }`}
            >
              {/* Top Row */}
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-white font-black shadow-lg ${
                  quiz?.show_question_result !== false && quiz?.show_correct_answer !== false
                    ? (isTimeoutQuestion ? 'bg-amber-500' : isAnswerCorrect ? 'bg-green-600' : 'bg-red-600')
                    : 'bg-primary'
                }`}>
                  {quiz?.show_question_result !== false && quiz?.show_correct_answer !== false
                    ? (isTimeoutQuestion ? <Clock className="h-6 w-6" /> : isAnswerCorrect ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />)
                    : <Check className="h-6 w-6" />
                  }
                </div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-base text-foreground">
                    {quiz?.show_question_result !== false && quiz?.show_correct_answer !== false
                      ? (isTimeoutQuestion ? 'Waktu Habis (Tidak Dijawab)' : isAnswerCorrect ? 'Jawaban Benar!' : 'Jawaban Salah!')
                      : (isTimeoutQuestion ? 'Waktu Habis (Tidak Dijawab)' : 'Jawaban Tersimpan')
                    }
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {quiz?.show_question_result !== false && quiz?.show_correct_answer !== false
                      ? (isTimeoutQuestion
                          ? 'Waktu pengerjaan telah habis sebelum Anda mengirim jawaban.'
                          : isAnswerCorrect 
                          ? (quiz?.show_score_per_question !== false ? `Anda mendapatkan +${scoreAwarded} Poin!` : 'Jawaban Anda tepat!') 
                          : 'Tetap semangat, coba lagi di soal berikutnya!')
                      : (quiz?.show_score_per_question !== false && isAnswerCorrect && scoreAwarded > 0
                        ? `Anda mendapatkan +${scoreAwarded} Poin!`
                        : (isTimeoutQuestion ? 'Waktu pengerjaan telah habis.' : 'Jawaban Anda telah berhasil disimpan.'))
                    }
                  </p>
                  {isCasualMode && !isTimeoutQuestion && (quiz?.show_question_result !== false && quiz?.show_correct_answer !== false) && !isAnswerCorrect && (
                    <p className="text-[10px] text-red-500 font-extrabold mt-1">
                      {isOutOfLives 
                        ? '💔 Nyawa Anda telah habis! Anda tidak dapat menjawab soal lagi.'
                        : `💔 Kehilangan 1 Nyawa! Sisa Nyawa: ${currentLives}`
                      }
                    </p>
                  )}
                </div>
              {isSelfPaced && (
                <button
                  type="button"
                  disabled={isProgressing}
                  onClick={async () => {
                    setShowFeedback(false);
                    setShowExplanationPanel(false);
                    setShowStatsPanel(false);
                    if (currentQuestionIndex + 1 < questions.length) {
                      await handleProgressQuestion(currentQuestionIndex + 1);
                    } else {
                      setShowReviewScreen(true);
                    }
                  }}
                  className="px-4 py-2.5 text-xs font-black rounded-xl bg-foreground text-background shadow hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isProgressing ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                      Memuat...
                    </>
                  ) : (
                    'Lanjut'
                  )}
                </button>
              )}
            </div>

            {/* Explanation Accordion */}
            {quiz?.show_explanation && currentQuestion?.explanation && (
              <div className="border-t border-border/60 pt-3">
                <button
                  type="button"
                  onClick={() => setShowExplanationPanel(!showExplanationPanel)}
                  className="flex items-center justify-between w-full text-xs font-bold text-muted-foreground hover:text-foreground transition outline-none"
                >
                  <span className="flex items-center gap-1.5">
                    💡 Pembahasan Soal
                  </span>
                  <span>{showExplanationPanel ? '▲ Sembunyikan' : '▼ Tampilkan'}</span>
                </button>
                
                <AnimatePresence>
                  {showExplanationPanel && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-2"
                    >
                      <div className="bg-muted/50 border border-border/40 p-3 rounded-2xl text-xs text-foreground font-medium leading-relaxed italic max-h-32 overflow-y-auto">
                        <LatexRenderer content={currentQuestion.explanation} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Stats Accordion */}
            {quiz?.show_question_statistics && (
              <div className="border-t border-border/60 pt-3">
                <button
                  type="button"
                  onClick={() => setShowStatsPanel(!showStatsPanel)}
                  className="flex items-center justify-between w-full text-xs font-bold text-muted-foreground hover:text-foreground transition outline-none"
                >
                  <span className="flex items-center gap-1.5">
                    📊 Statistik Peserta Lain
                  </span>
                  <span>{showStatsPanel ? '▲ Sembunyikan' : '▼ Tampilkan'}</span>
                </button>

                <AnimatePresence>
                  {showStatsPanel && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-2"
                    >
                      {loadingStats ? (
                        <p className="text-[10px] text-muted-foreground animate-pulse text-center py-2 font-medium">Memuat statistik...</p>
                      ) : questionStats && questionStats.totalCount > 0 ? (
                        <div className="space-y-2.5 p-3 rounded-2xl bg-muted/40 border border-border/40 text-[11px] font-semibold">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-green-600 dark:text-green-400">Jawaban Benar</span>
                              <span>{Math.round((questionStats.correctCount / questionStats.totalCount) * 100)}% ({questionStats.correctCount} murid)</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                              <div className="bg-green-500 h-full rounded-full" style={{ width: `${(questionStats.correctCount / questionStats.totalCount) * 100}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-red-500">Jawaban Salah</span>
                              <span>{Math.round((questionStats.incorrectCount / questionStats.totalCount) * 100)}% ({questionStats.incorrectCount} murid)</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                              <div className="bg-red-500 h-full rounded-full" style={{ width: `${(questionStats.incorrectCount / questionStats.totalCount) * 100}%` }} />
                            </div>
                          </div>
                          <p className="text-[9px] text-muted-foreground text-center font-medium mt-1">Total kontribusi respon: {questionStats.totalCount} peserta</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground text-center py-2 font-medium">Belum ada statistik respons untuk soal ini.</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        );
      })()}
      </AnimatePresence>

      {/* Answer selection pad layout */}
      <div className="mt-6 max-w-4xl mx-auto w-full">
        {currentQuestion.question_type === 'true_false' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {currentOptions.map((opt) => {
              const isSelected = selectedOptionIds.includes(opt.id);
              const isDisabled = hasAnswered || localTimer <= 0 || isOutOfLives;
              const shouldHighlight = hasAnswered || localTimer <= 0;
              const isTrue = opt.option_text.toLowerCase() === 'benar' || opt.option_text.toLowerCase() === 'true';

              let buttonColor = isTrue 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-red-600 hover:bg-red-700';

              const showCorrectAnswer = quiz?.show_correct_answer !== false;
              if (shouldHighlight) {
                if (showCorrectAnswer) {
                  buttonColor = opt.is_correct
                    ? 'bg-green-600 border-green-700 shadow-md scale-[1.01]'
                    : isSelected ? 'bg-red-500/60 border-red-500/80 opacity-60' : 'opacity-45 bg-zinc-400';
                } else {
                  if (isSelected) {
                    buttonColor = isTrue ? 'bg-blue-600 opacity-90 scale-[1.01] shadow-md' : 'bg-red-600 opacity-90 scale-[1.01] shadow-md';
                  } else {
                    buttonColor = 'opacity-45 bg-zinc-400';
                  }
                }
              } else if (isSelected) {
                buttonColor = `${buttonColor} ring-4 ring-white border-white scale-[1.01] shadow-lg`;
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (isSelfPaced) {
                      handleSelectOption(opt.id);
                    } else {
                      handleSelectOptionLegacy(opt.id);
                    }
                  }}
                  disabled={isDisabled}
                  className={`rounded-3xl p-8 text-white font-black text-xl flex flex-col items-center justify-center gap-4 transition duration-300 border-2 border-transparent outline-none shadow-md ${
                    buttonColor
                  } ${isDisabled && !shouldHighlight ? 'opacity-65 cursor-not-allowed' : ''} ${!isDisabled ? 'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]' : ''}`}
                >
                  <div className="text-4xl">{isTrue ? '👍' : '👎'}</div>
                  <div className="text-lg uppercase tracking-wider">{opt.option_text}</div>
                </button>
              );
            })}
          </div>
        ) : currentQuestion.question_type === 'multiple_answer' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentOptions.map((opt, idx) => {
                const isSelected = selectedOptionIds.includes(opt.id);
                const isDisabled = hasAnswered || localTimer <= 0 || isOutOfLives;
                const shouldHighlight = hasAnswered || localTimer <= 0;

                let buttonColor = colors[idx % 4];
                const showCorrectAnswer = quiz?.show_correct_answer !== false;
                if (shouldHighlight) {
                  if (showCorrectAnswer) {
                    buttonColor = opt.is_correct
                      ? 'bg-green-600 border-green-700 shadow-md scale-[1.01]'
                      : isSelected ? 'bg-red-500/60 border-red-500/80 opacity-60' : 'opacity-45 bg-zinc-400';
                  } else {
                    if (isSelected) {
                      buttonColor = `${buttonColor} opacity-90 scale-[1.01] shadow-md`;
                    } else {
                      buttonColor = 'opacity-45 bg-zinc-400';
                    }
                  }
                } else if (isSelected) {
                  buttonColor = `${buttonColor} ring-4 ring-white border-white scale-[1.01] shadow-lg`;
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleToggleMultipleOption(opt.id)}
                    disabled={isDisabled}
                    className={`rounded-2xl p-5 text-white font-black text-lg flex items-center justify-between transition duration-200 outline-none border border-transparent ${
                      buttonColor
                    } ${isDisabled && !shouldHighlight ? 'opacity-65 cursor-not-allowed' : ''} ${!isDisabled ? 'hover:scale-[1.01] hover:shadow-md' : ''}`}
                  >
                    <div className="flex items-center gap-4 truncate">
                      <div className="h-10 w-10 shrink-0 bg-white/20 rounded-xl flex items-center justify-center text-sm font-black">
                        {shapes[idx % 4]}
                      </div>
                      <div className="text-left text-sm md:text-base pr-2 truncate">
                        {opt.option_text}
                      </div>
                    </div>

                    {!shouldHighlight && (
                      <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition ${
                        isSelected ? 'bg-white text-primary border-white' : 'border-white/40'
                      }`}>
                        {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {!isSelfPaced && !hasAnswered && localTimer > 0 && !isOutOfLives && (
              <button
                type="button"
                onClick={() => submitAnswer({ optionIds: selectedOptionIds })}
                disabled={selectedOptionIds.length === 0}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black text-lg rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kirim Jawaban ({selectedOptionIds.length} Terpilih)
              </button>
            )}
          </div>
        ) : currentQuestion.question_type === 'matching' ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="space-y-3 bg-card/45 p-6 rounded-3xl border border-border">
              {currentOptions.map((opt, idx) => {
                const isDisabled = hasAnswered || localTimer <= 0 || isOutOfLives;
                const shouldHighlight = hasAnswered || localTimer <= 0;
                const matchedValue = matchingAnswers[opt.id] || '';
                const isMatchedCorrect = matchedValue === opt.match_text;
                
                let rowStyle = 'border-border';
                const showCorrectAnswer = quiz?.show_correct_answer !== false;
                if (shouldHighlight) {
                  if (showCorrectAnswer) {
                    rowStyle = isMatchedCorrect 
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400' 
                      : 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400';
                  } else {
                    rowStyle = 'border-primary bg-primary/5';
                  }
                }

                return (
                  <div 
                    key={opt.id}
                    className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-2xl border bg-background/50 justify-between transition ${rowStyle}`}
                  >
                    <div className="flex items-center gap-3 py-1 font-bold text-foreground text-sm sm:text-base pr-4">
                      <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black">
                        {idx + 1}
                      </span>
                      {opt.option_text}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs hidden sm:inline">pasangannya</span>
                      <span className="text-muted-foreground text-xs sm:hidden text-center block mb-1">Pasangannya:</span>
                      
                      {isDisabled ? (
                        <div className="px-4 py-2 bg-muted rounded-xl border font-bold text-xs">
                          {matchedValue || '(Belum dipasangkan)'}
                          {shouldHighlight && !isMatchedCorrect && showCorrectAnswer && (
                            <span className="block text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                              Kunci: {opt.match_text}
                            </span>
                          )}
                        </div>
                      ) : (
                        <select
                          value={matchedValue}
                          onChange={(e) => {
                            setMatchingAnswers(prev => ({
                              ...prev,
                              [opt.id]: e.target.value
                            }));
                          }}
                          className="bg-background rounded-xl border border-border px-3.5 py-2 text-xs font-bold focus:border-primary outline-none text-foreground"
                        >
                          <option value="">-- Pilih Pasangan --</option>
                          {shuffledMatches.map((mVal, mIdx) => (
                            <option key={mIdx} value={mVal}>
                              {mVal}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!isSelfPaced && !hasAnswered && localTimer > 0 && !isOutOfLives && (
              <button
                type="button"
                onClick={() => submitAnswer({ matchingAnswers })}
                disabled={currentOptions.some(o => !matchingAnswers[o.id])}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black text-lg rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kirim Pasangan
              </button>
            )}
          </div>
        ) : (
          /* Multiple Choice UI */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentOptions.map((opt, idx) => {
              const isSelected = selectedOptionIds.includes(opt.id);
              const isDisabled = hasAnswered || localTimer <= 0 || isOutOfLives;
              const shouldHighlight = hasAnswered || localTimer <= 0;

              let buttonColor = colors[idx % 4];
              const showCorrectAnswer = quiz?.show_correct_answer !== false;
              if (shouldHighlight) {
                if (showCorrectAnswer) {
                  buttonColor = opt.is_correct
                    ? 'bg-green-600 border-green-700 shadow-md scale-[1.01]'
                    : isSelected ? 'bg-red-500/60 border-red-500/80 opacity-60' : 'opacity-45 bg-zinc-400';
                } else {
                  if (isSelected) {
                    buttonColor = `${buttonColor} opacity-90 scale-[1.01] shadow-md`;
                  } else {
                    buttonColor = 'opacity-45 bg-zinc-400';
                  }
                }
              } else if (isSelected) {
                buttonColor = `${buttonColor} ring-4 ring-white border-white scale-[1.01] shadow-lg`;
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (isSelfPaced) {
                      handleSelectOption(opt.id);
                    } else {
                      handleSelectOptionLegacy(opt.id);
                    }
                  }}
                  disabled={isDisabled}
                  className={`rounded-2xl p-5 text-white font-black text-lg flex items-center gap-4 transition duration-200 outline-none ${
                    buttonColor
                  } ${isDisabled && !shouldHighlight ? 'opacity-65 cursor-not-allowed' : ''} ${!isDisabled ? 'hover:scale-[1.01] hover:shadow-md' : ''}`}
                >
                  <div className="h-10 w-10 shrink-0 bg-white/20 rounded-xl flex items-center justify-center text-sm font-black">
                    {shapes[idx % 4]}
                  </div>
                  <div className="text-left text-sm md:text-base pr-2 truncate">
                    <LatexRenderer content={opt.option_text} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* SELF-PACED ACTION CONTROL BAR */}
        {isSelfPaced && !hasAnswered && localTimer > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {isSelfPaced ? (
              <button
                type="button"
                onClick={handleSelfPacedSkip}
                className="flex items-center justify-center gap-2 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-extrabold text-sm rounded-2xl border border-zinc-700 active:scale-[0.98] transition"
              >
                <SkipForward className="h-4 w-4" />
                Lewati Soal (Skip)
              </button>
            ) : (
              <div className="opacity-0 pointer-events-none" /> /* Filler block */
            )}
            
            <button
              type="button"
              onClick={handleSelfPacedSubmit}
              disabled={
                isOutOfLives || (
                  currentQuestion.question_type === 'matching' 
                    ? currentOptions.some(o => !matchingAnswers[o.id]) 
                    : selectedOptionIds.length === 0
                )
              }
              className="flex items-center justify-center gap-2 py-4 bg-green-600 hover:bg-green-700 text-white font-black text-sm rounded-2xl shadow-md active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              Kirim Jawaban
            </button>
          </div>
        )}

        {/* SELF-PACED PROGRESS CONTINUATOR */}
        {isSelfPaced && hasAnswered && !showFeedback && (
          <div className="mt-6">
            <button
              type="button"
              disabled={isProgressing}
              onClick={async () => {
                if (currentQuestionIndex + 1 < questions.length) {
                  await handleProgressQuestion(currentQuestionIndex + 1);
                } else {
                  setShowReviewScreen(true);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-primary-foreground font-black text-base rounded-2xl shadow-lg hover:bg-primary/95 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProgressing ? (
                <>
                  <span className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Memuat Soal...
                </>
              ) : (
                currentQuestionIndex + 1 < questions.length ? 'Soal Berikutnya' : 'Review & Kirim Jawaban Akhir'
              )}
            </button>
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

      {/* Modern Warning Modal */}
      <AnimatePresence>
        {showWarningModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel p-6 rounded-3xl max-w-sm w-full border border-red-500/30 space-y-5 text-center shadow-2xl"
            >
              <div className="h-14 w-14 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto text-red-500">
                <AlertCircle className="h-8 w-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Peringatan Pelanggaran!</h3>
                <p className="text-[11px] text-red-500 font-bold italic leading-relaxed">
                  Penyebab: "{warningReason}"
                </p>
                <p className="text-xs text-muted-foreground font-semibold leading-relaxed mt-2">
                  Anda terdeteksi melakukan tindakan di luar sistem kuis SINESA.
                </p>
              </div>

              <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">Jumlah Pelanggaran:</span>
                <span className="text-sm font-black text-red-500">
                  {participant?.violation_count || 0} / {session?.auto_submit_on_violation ?? 3}
                </span>
              </div>

              <button
                onClick={() => setShowWarningModal(false)}
                className="w-full py-3 bg-foreground text-background font-black rounded-xl text-xs hover:opacity-90 active:scale-95 transition-all shadow-md"
              >
                Saya Mengerti & Lanjutkan
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Lockout Overlay */}
      {isFullscreenOverlayActive && (
        <div className="fixed inset-0 bg-zinc-950/95 z-50 flex flex-col items-center justify-center p-6 text-center select-none backdrop-blur-md">
          <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-red-500/25 space-y-6 shadow-2xl shadow-red-500/10">
            <div className="h-16 w-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto text-red-500 animate-pulse">
              <Eye className="h-8 w-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Mode Ujian Aman Aktif</h2>
              <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                Kuis ini mewajibkan Anda untuk berada dalam mode Layar Penuh (Fullscreen) untuk mencegah kecurangan.
              </p>
            </div>

            <button
              onClick={enterFullscreenMode}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-all"
            >
              Masuk Mode Layar Penuh
            </button>
          </div>
        </div>
      )}

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
              <span className="font-bold text-white text-xs">SINESA Player Diagnostik</span>
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
                <span className="text-amber-500 font-bold">{pin || '------'}</span>
              </div>
              <div className="flex justify-between">
                <span>Participant ID:</span>
                <span className="text-zinc-400 text-[10px] truncate max-w-[150px]" title={participant?.id}>
                  {participant?.id || 'null'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Score:</span>
                <span className="text-white font-bold">{participant?.score || 0} Pts</span>
              </div>
              <div className="flex justify-between">
                <span>Lives Left:</span>
                <span className="text-white font-bold">{lives}</span>
              </div>
              <div className="flex justify-between">
                <span>Sess Status:</span>
                <span className={`font-bold ${
                  session?.status === 'active' ? 'text-green-500' : 'text-amber-500'
                }`}>
                  {session?.status || 'null'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Index Soal:</span>
                <span className="text-white font-bold">{currentQuestionIndex}</span>
              </div>
              <div className="flex justify-between">
                <span>Sudah Jawab:</span>
                <span className={`font-bold ${hasAnswered ? 'text-green-500' : 'text-red-500'}`}>
                  {hasAnswered ? 'Ya' : 'Belum'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Local Timer:</span>
                <span id="student-diagnostics-timer" className="text-white font-bold">{localTimer}s</span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-1.5 text-[10px]">
                <span>State Update:</span>
                <span className="text-green-400 font-bold">{lastPollTime}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
