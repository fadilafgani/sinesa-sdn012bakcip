import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';
import { usePlayStore } from '../../store/play-store';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../components/theme-toggle';
import { getSafeMediaUrl } from '../../lib/media';
import { 
  LogOut, 
  ArrowRight, 
  PlayCircle, 
  Trophy, 
  BookOpen, 
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  Lock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ZoomIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LatexRenderer } from '../../components/latex-renderer';
import { LazyImage } from '../../components/lazy-image';

export const StudentDashboard: React.FC = () => {
  const { profile, signOut, isMock } = useAuthStore();
  const { joinSession, error: joinError, loading: joining } = usePlayStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [pinCode, setPinCode] = useState('');
  const [displayName, setDisplayName] = useState(profile?.full_name || '');
  const [error, setError] = useState<string | null>(null);
  
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pagination & Detail states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any | null>(null);

  // Image Zoom states
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomResetKey, setZoomResetKey] = useState<number>(0);

  // Predefined mock details helper
  const getMockDetail = (id: string, item: any) => {
    const baseQuestions = [
      {
        id: 'q1',
        question_text: 'Berapakah nilai x dari persamaan 3x + 5 = 14?',
        question_type: 'multiple_choice',
        media_type: 'text',
        media_url: null,
        points: 100,
        order_index: 0,
        explanation: 'Kurangi kedua ruas dengan 5: 3x = 9, maka x = 3.'
      },
      {
        id: 'q2',
        question_text: 'Faktorkan persamaan $x^2 - 5x + 6 = 0$.',
        question_type: 'multiple_choice',
        media_type: 'text',
        media_url: null,
        points: 100,
        order_index: 1,
        explanation: 'Hasil perkalian 6 dan penjumlahan -5 adalah -2 dan -3.'
      }
    ];

    const baseOptions = {
      'q1': [
        { id: 'o1_1', question_id: 'q1', option_text: '2', is_correct: false },
        { id: 'o1_2', question_id: 'q1', option_text: '3', is_correct: true },
        { id: 'o1_3', question_id: 'q1', option_text: '4', is_correct: false },
        { id: 'o1_4', question_id: 'q1', option_text: '5', is_correct: false },
      ],
      'q2': [
        { id: 'o2_1', question_id: 'q2', option_text: '$(x-2)(x-3) = 0$', is_correct: true },
        { id: 'o2_2', question_id: 'q2', option_text: '$(x+2)(x+3) = 0$', is_correct: false },
        { id: 'o2_3', question_id: 'q2', option_text: '$(x-1)(x-6) = 0$', is_correct: false },
        { id: 'o2_4', question_id: 'q2', option_text: '$(x+1)(x-6) = 0$', is_correct: false },
      ]
    };

    const baseAnswers = {
      'q1': { selected_option_id: 'o1_2', is_correct: true, score_awarded: 100 },
      'q2': { selected_option_id: 'o2_1', is_correct: true, score_awarded: 100 }
    };

    let showFinalResult = true;
    let showCorrectAnswer = true;
    let showExplanation = true;
    let showScorePerQuestion = true;
    let showAnswerReview = true;

    if (id === '3') {
      showExplanation = false;
    } else if (id === '4') {
      showCorrectAnswer = false;
      showExplanation = false;
      showScorePerQuestion = false;
    } else if (id === '5') {
      showFinalResult = false;
      showCorrectAnswer = false;
      showExplanation = false;
      showScorePerQuestion = false;
    } else if (id === '7') {
      showAnswerReview = false;
    }

    return {
      participant: {
        id: id,
        score: item.score,
        lives: 3,
        skipped_questions: [],
        question_status: { 'q1': 'answered', 'q2': 'answered' },
        current_progress: 1,
        is_completed: true
      },
      session: {
        id: 'sess-' + id,
        quiz_mode: 'serius',
        lives_count: 3,
        show_final_result: showFinalResult,
        show_leaderboard: true,
        show_correct_answer: showCorrectAnswer,
        show_answer_review: showAnswerReview,
        show_question_result: true,
        show_explanation: showExplanation,
        show_score_per_question: showScorePerQuestion,
        show_question_statistics: true
      },
      quiz: {
        id: 'quiz-' + id,
        title: item.title,
        description: 'Deskripsi Kuis ' + item.title,
        closing_text: 'Selamat! Anda telah menyelesaikan kuis ini.'
      },
      questions: baseQuestions,
      options: baseOptions,
      answers: baseAnswers
    };
  };

  const handleViewDetail = async (item: any) => {
    setSelectedHistoryItem(item);
    setDetailLoading(true);
    setDetailData(null);

    if (isMock) {
      await new Promise(resolve => setTimeout(resolve, 600));
      setDetailData(getMockDetail(item.id, item));
      setDetailLoading(false);
      return;
    }

    try {
      const { data: partData, error: partErr } = await supabase
        .from('participants')
        .select(`
          *,
          quiz_sessions (
            *,
            quizzes (
              *
            )
          )
        `)
        .eq('id', item.id)
        .single();

      if (partErr) throw partErr;

      const session = partData.quiz_sessions;
      const quiz = session?.quizzes;

      if (!quiz) {
        throw new Error('Data kuis tidak ditemukan.');
      }

      const { data: qData, error: qErr } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quiz.id)
        .order('order_index', { ascending: true });

      if (qErr) throw qErr;

      const qIds = qData.map((q: any) => q.id);
      let groupedOptions: Record<string, any[]> = {};
      if (qIds.length > 0) {
        const { data: optData, error: optErr } = await supabase
          .from('options')
          .select('*')
          .in('question_id', qIds);
        if (optErr) throw optErr;
        optData.forEach((opt: any) => {
          if (!groupedOptions[opt.question_id]) {
            groupedOptions[opt.question_id] = [];
          }
          groupedOptions[opt.question_id].push(opt);
        });
      }

      const { data: ansData, error: ansErr } = await supabase
        .from('answers')
        .select('*')
        .eq('participant_id', item.id);

      if (ansErr) throw ansErr;

      const answersMap: Record<string, any> = {};
      ansData?.forEach((ans: any) => {
        answersMap[ans.question_id] = ans;
      });

      setDetailData({
        participant: partData,
        session,
        quiz,
        questions: qData,
        options: groupedOptions,
        answers: answersMap
      });
    } catch (err) {
      console.error('Error fetching quiz detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (isMock) {
        setHistory([
          { id: '1', title: 'Ulangan Harian Matematika Aljabar', score: 850, date: '21 Mei 2026', accuracy: 90, showFinalResult: true, showAnswerReview: true },
          { id: '2', title: 'Kuis IPA Sistem Pencernaan', score: 720, date: '15 Mei 2026', accuracy: 80, showFinalResult: true, showAnswerReview: true },
          { id: '3', title: 'Bahasa Indonesia Makna Puisi', score: 940, date: '10 Mei 2026', accuracy: 100, showFinalResult: true, showAnswerReview: true },
          { id: '4', title: 'Kuis Fisika Gerak Lurus', score: 600, date: '05 Mei 2026', accuracy: 60, showFinalResult: true, showAnswerReview: true },
          { id: '5', title: 'Ulangan Kimia Stoikiometri', score: 780, date: '02 Mei 2026', accuracy: 75, showFinalResult: false, showAnswerReview: true },
          { id: '6', title: 'Kuis Sejarah Perang Kemerdekaan', score: 900, date: '28 April 2026', accuracy: 95, showFinalResult: true, showAnswerReview: true },
          { id: '7', title: 'Bahasa Inggris Reading Comprehension', score: 820, date: '22 April 2026', accuracy: 85, showFinalResult: true, showAnswerReview: false },
          { id: '8', title: 'Kuis IPS Letak Geografis Indonesia', score: 880, date: '18 April 2026', accuracy: 90, showFinalResult: true, showAnswerReview: true }
        ]);
        return;
      }

      if (!profile?.id) return;

      setLoadingHistory(true);
      try {
        // Auto-refresh token if expired
        try {
          await supabase.auth.getSession();
        } catch (e) {
          console.warn('Failed to refresh session:', e);
        }

        const { data, error } = await supabase
          .from('participants')
          .select(`
            id,
            score,
            joined_at,
            quiz_sessions!inner(
              id,
              completed_at,
              show_final_result,
              show_answer_review,
              quizzes!inner(
                id,
                title
              )
            ),
            answers(
              id,
              is_correct
            )
          `)
          .eq('student_id', profile.id)
          .order('joined_at', { ascending: false });

        if (error) {
          console.error('Error fetching student history:', error);
        } else if (data) {
          const formatted = data.map((p: any) => {
            const quizTitle = p.quiz_sessions?.quizzes?.title || 'Kuis Tanpa Judul';
            const dateStr = p.joined_at 
              ? new Date(p.joined_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
              : '-';
            
            const totalAnswers = p.answers?.length || 0;
            const correctAnswers = p.answers?.filter((a: any) => a.is_correct).length || 0;
            const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

            return {
              id: p.id,
              title: quizTitle,
              score: p.score,
              date: dateStr,
              accuracy,
              showFinalResult: p.quiz_sessions?.show_final_result !== false,
              showAnswerReview: p.quiz_sessions?.show_answer_review !== false,
            };
          });
          setHistory(formatted);
        }
      } catch (err) {
        console.error('Failed to fetch evaluation history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [profile?.id, isMock, location.key]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pinCode || !displayName) {
      setError('Harap lengkapi PIN kuis dan nama tampilan Anda.');
      return;
    }

    if (pinCode.length < 6) {
      setError('PIN kuis harus terdiri dari 6 angka.');
      return;
    }

    const success = await joinSession(pinCode, displayName, profile?.id);
    if (success) {
      navigate(`/student/play-session?pin=${pinCode}&name=${encodeURIComponent(displayName)}`);
    } else {
      setError(joinError || 'Gagal bergabung ke sesi kuis.');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen p-6 bg-mesh">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500 flex items-center justify-center text-yellow-950 font-extrabold shadow shadow-amber-500/20">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">SINESA Siswa</h1>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Portal Evaluasi Belajar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground hidden md:inline">
              Halo, <span className="text-foreground">{profile?.full_name}</span>
            </span>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 text-sm font-semibold transition hover:bg-destructive hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>

        {/* PIN Entry Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel p-8 rounded-3xl shadow-lg border-amber-500/10 space-y-6 md:mt-6"
          >
            <div className="text-center space-y-2">
              <PlayCircle className="h-12 w-12 text-primary mx-auto animate-pulse" />
              <h2 className="text-2xl font-black text-foreground">Gabung Kuis Sekarang</h2>
              <p className="text-xs text-muted-foreground">Masukkan 6 digit kode PIN yang diberikan oleh Guru Anda</p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-xs text-destructive font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Kode PIN Kuis</label>
                <input
                  type="text"
                  maxLength={6}
                  value={pinCode}
                  onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 482019"
                  className="w-full mt-1 text-center font-black tracking-widest text-2xl rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Nama Tampilan Anda</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Masukkan nama panggilan..."
                  className="w-full mt-1 text-sm font-semibold rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15"
                />
              </div>

              <button
                type="submit"
                disabled={joining}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-yellow-950 font-black py-4 shadow-lg shadow-amber-500/25 transition disabled:opacity-50"
              >
                {joining ? 'Bergabung...' : 'Masuk Lobby Kuis'}
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>
          </motion.div>

          {/* Student Evaluation History */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Riwayat Kuis Terakhir
            </h3>

            <div className="space-y-3">
              {loadingHistory ? (
                <div className="text-center p-8 text-muted-foreground text-sm font-medium">
                  <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  Memuat riwayat kuis...
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-card/40 border border-dashed rounded-3xl p-8 text-center italic">
                  Belum ada riwayat kuis yang diikuti.
                </p>
              ) : (
                <>
                  {history.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((h, idx) => {
                    const isLocked = !h.showAnswerReview;
                    return (
                      <motion.div
                        key={h.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => handleViewDetail(h)}
                        className="glass-panel p-5 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/5 active:scale-[0.99] transition duration-200 group"
                      >
                        <div className="space-y-1 text-left">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-foreground line-clamp-1 group-hover:text-primary transition">{h.title}</h4>
                            {isLocked && (
                              <span className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">
                                🔒 Detail Dikunci
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-semibold uppercase">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {h.date}
                            </span>
                            <span className="flex items-center gap-1 text-green-600">
                              <BookOpen className="h-3 w-3" />
                              Akurasi: {h.accuracy}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Skor Akhir</span>
                            <span className="font-black text-lg text-primary">
                              {h.showFinalResult ? `${h.score} pts` : '🔒 Disembunyikan'}
                            </span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition group-hover:translate-x-0.5" />
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pagination Controls */}
                  {history.length > itemsPerPage && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider text-left w-full sm:w-auto">
                        Menampilkan <span className="text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-foreground">{Math.min(currentPage * itemsPerPage, history.length)}</span> dari <span className="text-foreground">{history.length}</span> kuis
                      </span>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
                          title="Halaman Sebelumnya"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        
                        {[...Array(Math.ceil(history.length / itemsPerPage))].map((_, i) => {
                          const pageNum = i + 1;
                          const isActive = currentPage === pageNum;
                          return (
                            <button
                              type="button"
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition active:scale-95 border ${
                                isActive 
                                  ? 'bg-amber-500 border-amber-500 text-yellow-950 font-black shadow-lg shadow-amber-500/15' 
                                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        
                        <button
                          type="button"
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(history.length / itemsPerPage), prev + 1))}
                          disabled={currentPage === Math.ceil(history.length / itemsPerPage)}
                          className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
                          title="Halaman Berikutnya"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Quiz Detail Modal */}
      <AnimatePresence>
        {selectedHistoryItem && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl border-border bg-background overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border p-5 shrink-0 bg-card/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-primary">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-black text-foreground line-clamp-1">
                      {selectedHistoryItem.title}
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Dikerjakan pada {selectedHistoryItem.date}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHistoryItem(null);
                    setDetailData(null);
                  }}
                  className="p-2 rounded-xl hover:bg-accent hover:text-foreground text-muted-foreground transition active:scale-95"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detailLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-4">
                    <div className="h-10 w-10 animate-spin border-4 border-amber-500 border-t-transparent rounded-full" />
                    <p className="text-sm font-semibold text-muted-foreground">Memuat detail hasil kuis...</p>
                  </div>
                ) : detailData ? (
                  <>
                    {/* Stats Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Score Card */}
                      <div className="glass-panel p-4 rounded-2xl border bg-card/30 flex flex-col justify-between space-y-2 text-left">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Skor Akhir</span>
                        <div>
                          {detailData.session?.show_final_result !== false ? (
                            <span className="text-2xl font-black text-primary">
                              {detailData.participant?.score || 0} <span className="text-xs font-semibold text-muted-foreground uppercase">pts</span>
                            </span>
                          ) : (
                            <span className="text-sm font-black text-zinc-500 flex items-center gap-1.5 py-1">
                              <Lock className="h-4 w-4" /> Disembunyikan
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Accuracy Card */}
                      <div className="glass-panel p-4 rounded-2xl border bg-card/30 flex flex-col justify-between space-y-2 text-left">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Akurasi Jawaban</span>
                        <div>
                          <span className="text-2xl font-black text-green-500">
                            {selectedHistoryItem.accuracy}%
                          </span>
                        </div>
                      </div>

                      {/* Mode Card */}
                      <div className="glass-panel p-4 rounded-2xl border bg-card/30 flex flex-col justify-between space-y-2 text-left">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Mode Kuis</span>
                        <div>
                          <span className="text-sm font-bold text-foreground capitalize">
                            {detailData.session?.quiz_mode === 'santai' ? '🎮 Mode Santai' : '🔒 Mode Serius'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Question list or restricted warning */}
                    {detailData.session?.show_answer_review === false ? (
                      <div className="border border-dashed border-border p-8 rounded-2xl text-center space-y-3 bg-card/10">
                        <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
                        <h4 className="font-bold text-foreground text-sm">Detail Review Dinonaktifkan</h4>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                          Guru menonaktifkan review detail pertanyaan dan jawaban untuk sesi kuis ini. Anda hanya dapat melihat ringkasan skor dan akurasi di atas.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-left">
                          Review Pertanyaan ({detailData.questions.length})
                        </h4>

                        <div className="space-y-6">
                          {detailData.questions.map((q: any, qIdx: number) => {
                            const ans = detailData.answers[q.id];
                            const opts = detailData.options[q.id] || [];
                            const isCorrect = ans?.is_correct || false;
                            const hasAnswered = !!ans && (
                              ans.selected_option_id !== null || 
                              (ans.selected_option_ids && ans.selected_option_ids.length > 0) || 
                              (ans.matching_answers && Object.keys(ans.matching_answers).length > 0)
                            );

                            const showCorrectAnswer = detailData.session?.show_correct_answer !== false;
                            const showExplanationSetting = detailData.session?.show_explanation !== false;
                            const showScoreSetting = detailData.session?.show_score_per_question !== false;

                            // Determine state badge
                            let statusBadge = (
                              <span className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-[10px] font-bold text-zinc-400">
                                <HelpCircle className="h-3 w-3" /> Dilewati / Tidak Dijawab
                              </span>
                            );

                            if (hasAnswered) {
                              if (showCorrectAnswer) {
                                statusBadge = isCorrect ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-green-500/10 border border-green-500/30 px-2 py-1 text-[10px] font-bold text-green-500">
                                    <CheckCircle2 className="h-3 w-3" /> Benar
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-red-500/10 border border-red-500/30 px-2 py-1 text-[10px] font-bold text-red-500">
                                    <XCircle className="h-3 w-3" /> Salah
                                  </span>
                                );
                              } else {
                                statusBadge = (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-500">
                                    <CheckCircle2 className="h-3 w-3" /> Terjawab
                                  </span>
                                );
                              }
                            }

                            return (
                              <div 
                                key={q.id}
                                className="glass-panel p-5 rounded-2xl border border-border/80 bg-card/10 space-y-4 text-left"
                              >
                                {/* Question header */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                                  <span className="text-xs font-bold text-foreground">
                                    Soal {qIdx + 1}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {statusBadge}
                                    {showScoreSetting && (
                                      <span className={`text-[10px] font-bold ${isCorrect && showCorrectAnswer ? 'text-green-500' : 'text-zinc-500'}`}>
                                        {isCorrect && showCorrectAnswer ? `+${ans?.score_awarded || q.points} Poin` : `0 Poin`}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Question text */}
                                <div className="text-sm font-semibold text-foreground leading-relaxed">
                                  {q.question_text.startsWith('$') ? (
                                    <LatexRenderer tex={q.question_text} />
                                  ) : (
                                    q.question_text
                                  )}
                                </div>

                                {/* Question Media */}
                                {q.media_url && (
                                  <div className="mt-2.5">
                                    {q.media_type === 'image' ? (
                                      <div 
                                        onClick={() => {
                                          setZoomImage(q.media_url);
                                          setZoomScale(1);
                                          setZoomResetKey(k => k + 1);
                                        }}
                                        className="relative group cursor-zoom-in overflow-hidden rounded-xl max-w-xs border border-border/50"
                                      >
                                        <LazyImage 
                                          src={q.media_url} 
                                          alt={`Media soal ${qIdx + 1}`}
                                          className="max-h-40 w-auto object-cover group-hover:scale-[1.02] transition duration-200"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                                          <ZoomIn className="h-6 w-6 text-white" />
                                        </div>
                                      </div>
                                    ) : q.media_type === 'audio' ? (
                                      <div className="max-w-xs">
                                        <audio key={q.media_url} controls src={getSafeMediaUrl(q.media_url)} className="w-full scale-90 origin-left" />
                                      </div>
                                    ) : q.media_type === 'video' ? (
                                      <div className="max-w-xs overflow-hidden rounded-xl border">
                                        <video key={q.media_url} controls src={getSafeMediaUrl(q.media_url)} className="max-h-40 w-full bg-black" />
                                      </div>
                                    ) : q.media_type === 'latex' ? (
                                      <div className="p-3 bg-card rounded-xl border border-border">
                                        <LatexRenderer tex={q.media_url} displayMode />
                                      </div>
                                    ) : null}
                                  </div>
                                )}

                                {/* Options list */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                  {opts.map((opt: any) => {
                                    const isOptionSelected = ans?.selected_option_id === opt.id || (ans?.selected_option_ids && ans.selected_option_ids.includes(opt.id));
                                    const isOptionCorrect = opt.is_correct;

                                    let optStyle = 'border-border/60 bg-card/25 text-muted-foreground';
                                    let badgeText = '';

                                    if (showCorrectAnswer) {
                                      if (isOptionCorrect) {
                                        optStyle = 'border-green-500/50 bg-green-500/5 text-green-600 dark:text-green-400 font-bold';
                                        if (isOptionSelected) {
                                          badgeText = 'Jawaban Benar Anda';
                                        } else {
                                          badgeText = 'Jawaban Benar';
                                        }
                                      } else if (isOptionSelected) {
                                        optStyle = 'border-red-500/50 bg-red-500/5 text-red-600 dark:text-red-400 font-bold';
                                        badgeText = 'Jawaban Salah Anda';
                                      }
                                    } else {
                                      if (isOptionSelected) {
                                        optStyle = 'border-amber-500/50 bg-amber-500/5 text-amber-600 dark:text-amber-400 font-bold';
                                        badgeText = 'Pilihan Anda';
                                      }
                                    }

                                    return (
                                      <div 
                                        key={opt.id}
                                        className={`rounded-xl border p-3.5 text-xs flex items-center justify-between transition-all duration-200 ${optStyle}`}
                                      >
                                        <span className="leading-relaxed">
                                          {opt.option_text.startsWith('$') ? (
                                            <LatexRenderer tex={opt.option_text} />
                                          ) : (
                                            opt.option_text
                                          )}
                                        </span>
                                        {badgeText && (
                                          <span className="shrink-0 text-[8px] font-black uppercase tracking-wider border border-current px-1.5 py-0.5 rounded ml-2">
                                            {badgeText}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Explanation Accordion */}
                                {showExplanationSetting && q.explanation && (
                                  <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl space-y-1 mt-3 text-left">
                                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1.5">💡 Pembahasan Soal</p>
                                    <p className="text-xs text-foreground italic font-medium leading-relaxed">{q.explanation}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-20 text-center text-muted-foreground font-semibold text-sm">
                    Gagal memuat detail kuis.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Zoom Lightbox Overlay */}
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
              type="button"
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
                type="button"
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
                type="button"
                onClick={() => setZoomScale(prev => Math.min(4, prev + 0.25))}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xl font-bold transition-all"
                title="Perbesar"
              >
                +
              </button>
              <div className="h-6 w-px bg-zinc-800" />
              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setZoomResetKey(prev => prev + 1);
                }}
                className="px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 active:scale-95 rounded-xl transition-all"
                title="Reset Zoom & Posisi"
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
