import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';
import { QuizService } from '../../services/quiz.service';
import { AuthService } from '../../services/auth.service';
import type { Quiz } from '../../types';
import { getSafeMediaUrl } from '../../lib/media';
import { Plus, Edit2, Play, BarChart2, Trash2, LogOut, BookOpen, Clock, Layers } from 'lucide-react';
import { ThemeToggle } from '../../components/theme-toggle';
import { showConfirm, showError, showSuccess } from '../../lib/swal';

export const TeacherDashboard: React.FC = () => {
  const { profile, signOut, isMock } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(false);

  // Seed default quizzes in mock mode if they do not exist
  const seedMockQuizzes = () => {
    const existing = localStorage.getItem('quizzes');
    if (existing) return JSON.parse(existing);

    const mockQuizzes: Quiz[] = [
      {
        id: 'quiz-mock-1',
        teacher_id: 'mock-uuid-teacher',
        title: 'Kuis Matematika Dasar (Aljabar & LaTeX)',
        description: 'Evaluasi pemecahan persamaan matematika, kuadrat, dan rumus-rumus LaTeX.',
        opening_text: null,
        closing_text: null,
        pin_code: '482019',
        duration_per_question: 30,
        random_questions: false,
        random_options: true,
        thumbnail_url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80',
        quiz_mode: 'serius',
        lives_count: 3,
        show_final_result: true,
        show_leaderboard: true,
        show_correct_answer: true,
        show_answer_review: true,
        show_question_result: true,
        show_explanation: true,
        show_score_per_question: true,
        show_question_statistics: true,
        anti_cheat_enabled: false,
        fullscreen_required: false,
        auto_submit_on_violation: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'quiz-mock-2',
        teacher_id: 'mock-uuid-teacher',
        title: 'Pengetahuan Umum & Kuis Audio',
        description: 'Kuis interaktif geografi dunia dan seni pendengaran dengan audio soal.',
        opening_text: null,
        closing_text: null,
        pin_code: '901247',
        duration_per_question: 20,
        random_questions: true,
        random_options: true,
        thumbnail_url: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?w=400&q=80',
        quiz_mode: 'santai',
        lives_count: 3,
        show_final_result: true,
        show_leaderboard: true,
        show_correct_answer: true,
        show_answer_review: true,
        show_question_result: true,
        show_explanation: true,
        show_score_per_question: true,
        show_question_statistics: true,
        anti_cheat_enabled: false,
        fullscreen_required: false,
        auto_submit_on_violation: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ];

    // Seed Questions
    const mockQuestions1 = [
      {
        id: 'q1',
        quiz_id: 'quiz-mock-1',
        question_text: 'Tentukan akar-akar dari persamaan kuadrat berikut: $x^2 - 5x + 6 = 0$. Berapa nilai $x$?',
        media_type: 'latex',
        media_url: 'x^2 - 5x + 6 = 0',
        points: 100,
        order_index: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: 'q2',
        quiz_id: 'quiz-mock-1',
        question_text: 'Berapakah nilai turunan pertama dari fungsi $f(x) = 3x^2$ pada $x = 2$?',
        media_type: 'latex',
        media_url: 'f\'(x) = \\frac{d}{dx}(3x^2)',
        points: 100,
        order_index: 1,
        created_at: new Date().toISOString(),
      }
    ];

    const mockOptions1 = {
      'q1': [
        { id: 'o1-1', question_id: 'q1', option_text: '$x = 2$ atau $x = 3$', is_correct: true, created_at: new Date().toISOString() },
        { id: 'o1-2', question_id: 'q1', option_text: '$x = -2$ atau $x = -3$', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o1-3', question_id: 'q1', option_text: '$x = 1$ atau $x = 6$', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o1-4', question_id: 'q1', option_text: '$x = 1$ atau $x = 5$', is_correct: false, created_at: new Date().toISOString() },
      ],
      'q2': [
        { id: 'o2-1', question_id: 'q2', option_text: '12', is_correct: true, created_at: new Date().toISOString() },
        { id: 'o2-2', question_id: 'q2', option_text: '6', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o2-3', question_id: 'q2', option_text: '8', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o2-4', question_id: 'q2', option_text: '15', is_correct: false, created_at: new Date().toISOString() },
      ]
    };

    const mockQuestions2 = [
      {
        id: 'q3',
        quiz_id: 'quiz-mock-2',
        question_text: 'Perhatikan gambar monumen terkenal di bawah ini. Negara manakah tempat monumen ini berada?',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1543349689-9a4d426bee87?w=600&q=80',
        points: 100,
        order_index: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: 'q4',
        quiz_id: 'quiz-mock-2',
        question_text: 'Dengarkan suara musik instrumen gitar berikut. Genre apakah ini?',
        media_type: 'audio',
        media_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Open-source demo audio link
        points: 100,
        order_index: 1,
        created_at: new Date().toISOString(),
      }
    ];

    const mockOptions2 = {
      'q3': [
        { id: 'o3-1', question_id: 'q3', option_text: 'Prancis (Menara Eiffel)', is_correct: true, created_at: new Date().toISOString() },
        { id: 'o3-2', question_id: 'q3', option_text: 'Italia (Menara Pisa)', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o3-3', question_id: 'q3', option_text: 'Inggris (Big Ben)', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o3-4', question_id: 'q3', option_text: 'Spanyol (Sagrada Familia)', is_correct: false, created_at: new Date().toISOString() },
      ],
      'q4': [
        { id: 'o4-1', question_id: 'q4', option_text: 'Klasik / Akustik', is_correct: true, created_at: new Date().toISOString() },
        { id: 'o4-2', question_id: 'q4', option_text: 'Jazz Modern', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o4-3', question_id: 'q4', option_text: 'Rock Elektrik', is_correct: false, created_at: new Date().toISOString() },
        { id: 'o4-4', question_id: 'q4', option_text: 'K-Pop Elektronik', is_correct: false, created_at: new Date().toISOString() },
      ]
    };

    localStorage.setItem('quizzes', JSON.stringify(mockQuizzes));
    localStorage.setItem('questions_quiz-mock-1', JSON.stringify(mockQuestions1));
    localStorage.setItem('questions_quiz-mock-2', JSON.stringify(mockQuestions2));
    
    localStorage.setItem('options_q1', JSON.stringify(mockOptions1['q1']));
    localStorage.setItem('options_q2', JSON.stringify(mockOptions1['q2']));
    localStorage.setItem('options_q3', JSON.stringify(mockOptions2['q3']));
    localStorage.setItem('options_q4', JSON.stringify(mockOptions2['q4']));

    return mockQuizzes;
  };

  const fetchQuizzes = async () => {
    setLoading(true);
    if (isMock) {
      const mockQs = seedMockQuizzes();
      // Filter mock quizzes by current teacher's profile ID
      const filtered = mockQs.filter((q: Quiz) => q.teacher_id === profile?.id);
      setQuizzes(filtered);
      setLoading(false);
      return;
    }

    try {
      console.log('TeacherDashboard: fetchQuizzes starting, profile id =', profile?.id);
      
      // Auto-refresh token if expired
      await AuthService.refreshSession();

      if (profile?.id) {
        const res = await QuizService.getQuizzesByTeacherId(profile.id);
        if (!res.success) {
          console.error('TeacherDashboard: error fetching quizzes:', res.error);
        } else if (res.data) {
          console.log('TeacherDashboard: successfully fetched quizzes count =', res.data.length);
          setQuizzes(res.data);
        }
      }
    } catch (err) {
      console.error('Error fetching quizzes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.id) {
      console.log('TeacherDashboard: useEffect triggered for fetchQuizzes, location key =', location.key);
      fetchQuizzes();
    }
  }, [profile?.id, isMock, location.key]);

  const handleLaunchQuiz = (quizId: string) => {
    navigate(`/teacher/host-session?id=${quizId}`);
  };

  const handleDeleteQuiz = async (quizId: string) => {
    const confirmRes = await showConfirm(
      'Hapus Kuis',
      'Apakah Anda yakin ingin menghapus kuis ini beserta seluruh soalnya?',
      'Ya, Hapus',
      'Batal'
    );
    if (!confirmRes.isConfirmed) return;

    if (isMock) {
      const filtered = quizzes.filter(q => q.id !== quizId);
      localStorage.setItem('quizzes', JSON.stringify(filtered));
      setQuizzes(filtered);
      showSuccess('Berhasil', 'Kuis telah dihapus (Mode Mock).');
      return;
    }

    try {
      const res = await QuizService.deleteQuiz(quizId);

      if (res.success) {
        setQuizzes(quizzes.filter(q => q.id !== quizId));
        showSuccess('Berhasil', 'Kuis telah dihapus secara permanen.');
      } else {
        showError('Gagal', `Gagal menghapus kuis: ${res.error?.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Error deleting quiz:', err);
      showError('Kesalahan', `Terjadi kesalahan: ${err.message || err}`);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-8 border-b pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center text-white font-extrabold shadow shadow-primary/20">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">SINESA Guru</h1>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Dashboard Pembelajaran
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

        {/* Top welcome Card banner */}
        <div className="glass-panel p-8 rounded-3xl mb-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl text-center md:text-left">
            <h2 className="text-2xl font-black text-foreground">Evaluasi Pembelajaran Siswa Lebih Menyenangkan!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Buat kuis interaktif dengan timer, upload materi penunjang seperti gambar/audio, sematkan persamaan matematika LaTeX, dan lihat hasil leaderboard siswa secara realtime.
            </p>
          </div>
          <button
            onClick={() => navigate('/teacher/quiz-editor?new=true')}
            className="flex items-center gap-2.5 rounded-2xl bg-primary text-primary-foreground px-6 py-4 font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="h-5 w-5 text-yellow-300" />
            Buat Kuis Baru
          </button>
        </div>

        {/* Main Quiz grid */}
        <div>
          <div className="flex items-center gap-2.5 mb-5">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Daftar Kuis Anda</h3>
          </div>

          {loading ? (
            <div className="text-center p-12 text-muted-foreground text-sm font-medium">
              Memuat koleksi kuis SINESA Anda...
            </div>
          ) : quizzes.length === 0 ? (
            <div className="text-center p-16 glass-panel rounded-3xl border border-dashed text-muted-foreground space-y-4">
              <p className="text-sm">Anda belum memiliki kuis. Ayo buat kuis pertama Anda sekarang!</p>
              <button
                onClick={() => navigate('/teacher/quiz-editor?new=true')}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold"
              >
                <Plus className="h-4 w-4" />
                Mulai Buat Kuis
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="glass-panel rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 border flex flex-col justify-between"
                >
                  <div>
                    {/* Thumbnail */}
                    <div className="h-40 bg-muted relative overflow-hidden">
                      <img
                        src={getSafeMediaUrl(quiz.thumbnail_url) || 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=80'}
                        alt={quiz.title}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-yellow-300 text-xs font-mono font-bold px-3 py-1 rounded-full border border-white/10">
                        PIN: {quiz.pin_code}
                      </div>
                    </div>

                    {/* Metadata & Title */}
                    <div className="p-5 space-y-3">
                      <h4 className="font-extrabold text-lg text-foreground line-clamp-1">{quiz.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {quiz.description || 'Tidak ada deskripsi kuis.'}
                      </p>

                      <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground pt-2">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {quiz.duration_per_question}d per soal
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" />
                          {quiz.random_questions ? 'Soal Acak' : 'Berurutan'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="p-5 pt-0 border-t border-border bg-muted/20 grid grid-cols-4 gap-2 items-center">
                    <button
                      onClick={() => handleLaunchQuiz(quiz.id)}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold py-2 text-xs transition shadow-sm"
                      title="Mulai Kuis Realtime"
                    >
                      <Play className="h-3.5 w-3.5 fill-white" />
                      Mainkan
                    </button>
                    <button
                      onClick={() => navigate(`/teacher/quiz-editor?id=${quiz.id}`)}
                      className="col-span-1 flex items-center justify-center rounded-xl bg-background border hover:bg-muted text-foreground py-2 text-xs transition"
                      title="Edit Kuis"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => navigate(`/teacher/analytics?id=${quiz.id}`)}
                      className="col-span-1 flex items-center justify-center rounded-xl bg-background border hover:bg-muted text-foreground py-2 text-xs transition"
                      title="Statistik & Analisis"
                    >
                      <BarChart2 className="h-3.5 w-3.5 text-primary" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuiz(quiz.id)}
                      className="col-span-4 mt-1.5 flex items-center justify-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive py-1.5 text-[10px] font-bold transition"
                      title="Hapus Kuis"
                    >
                      <Trash2 className="h-3 w-3" />
                      Hapus Kuis
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
