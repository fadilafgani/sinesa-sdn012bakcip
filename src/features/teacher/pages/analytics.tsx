import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { QuizService } from '@/features/quiz/services/quiz.service';
import { SessionService } from '@/features/session/services/session.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { QuestionService } from '@/features/question/services/question.service';
import { AnswerService } from '@/features/answer/services/answer.service';
import type { Quiz, Answer, Option, Participant, QuizSession } from '@/types';
import { exportToCSV, exportToPDF, exportToExcel } from '@/shared/utils/export';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  ArrowLeft, FileSpreadsheet, FileText, CheckCircle, XCircle, Award, 
  Users, BarChart3, Calculator, CheckCircle2, HelpCircle, Layers, Calendar,
  ShieldAlert, FileQuestion, AlertTriangle
} from 'lucide-react';
import { ThemeToggle } from '@/shared/components/theme-toggle';

export type AnalyticsState = 'loading' | 'success' | 'empty' | 'access_denied' | 'not_found' | 'unauthorized' | 'error';

interface ErrorInfo {
  title: string;
  message: string;
  status?: number;
}

interface StudentStat {
  rank: number;
  name: string;
  score: number;
  correct: number;
  incorrect: number;
  accuracy: number;
}

interface QuestionStat {
  questionText: string;
  correctCount: number;
  totalAnswers: number;
  correctPercent: number;
}

interface OptionDistribution {
  id: string;
  label: string; // 'A', 'B', 'C', 'D'
  text: string;
  isCorrect: boolean;
  count: number;
  percentage: number;
}

interface QuestionDistribution {
  questionId: string;
  questionIndex: number;
  questionText: string;
  questionType: string;
  totalParticipants: number;
  totalResponses: number;
  unansweredCount: number;
  unansweredPercent: number;
  options: OptionDistribution[];
}

export const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const quizIdParam = searchParams.get('id');
  const sessionIdParam = searchParams.get('session_id') || searchParams.get('sessionId');
  const { isMock, profile } = useAuthStore();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(sessionIdParam || '');
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [questionDistributions, setQuestionDistributions] = useState<QuestionDistribution[]>([]);
  const [averageScore, setAverageScore] = useState<number | null>(null);
  const [validCompletedCount, setValidCompletedCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [analyticsState, setAnalyticsState] = useState<AnalyticsState>('loading');
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  // Generate realistic dummy data for mock analytics
  const generateMockAnalytics = () => {
    const students = [
      { name: 'Ani Wijaya', score: 380, correct: 4, incorrect: 0 },
      { name: 'Budi Santoso', score: 320, correct: 3, incorrect: 1 },
      { name: 'Dedi Kurniawan', score: 290, correct: 3, incorrect: 1 },
      { name: 'Siti Rahma', score: 210, correct: 2, incorrect: 2 },
      { name: 'Joko Susilo', score: 180, correct: 2, incorrect: 2 },
      { name: 'Rini Astuti', score: 90, correct: 1, incorrect: 3 }
    ];

    const stats: StudentStat[] = students
      .sort((a, b) => b.score - a.score)
      .map((s, idx) => ({
        rank: idx + 1,
        name: s.name,
        score: s.score,
        correct: s.correct,
        incorrect: s.incorrect,
        accuracy: Math.round((s.correct / (s.correct + s.incorrect)) * 100)
      }));

    const totalScore = students.reduce((sum, s) => sum + s.score, 0);
    const avgScore = Math.round((totalScore / students.length) * 10) / 10;
    setAverageScore(avgScore);
    setValidCompletedCount(students.length);

    const qStats: QuestionStat[] = [
      { questionText: 'Soal #1: Rumus Pythagoras', correctCount: 5, totalAnswers: 6, correctPercent: 83 },
      { questionText: 'Soal #2: Persamaan Kuadrat', correctCount: 4, totalAnswers: 6, correctPercent: 66 },
      { questionText: 'Soal #3: Monumen Terkenal', correctCount: 3, totalAnswers: 6, correctPercent: 50 },
      { questionText: 'Soal #4: Genre Musik Instrumen', correctCount: 3, totalAnswers: 6, correctPercent: 50 },
    ];

    const mockDistributions: QuestionDistribution[] = [
      {
        questionId: 'mock-q1',
        questionIndex: 1,
        questionText: 'Rumus Teorema Pythagoras untuk segitiga siku-siku adalah...',
        questionType: 'multiple_choice',
        totalParticipants: 6,
        totalResponses: 6,
        unansweredCount: 0,
        unansweredPercent: 0,
        options: [
          { id: 'opt-1', label: 'A', text: 'a² + b² = c²', isCorrect: true, count: 5, percentage: 83.3 },
          { id: 'opt-2', label: 'B', text: 'a + b = c', isCorrect: false, count: 1, percentage: 16.7 },
          { id: 'opt-3', label: 'C', text: 'a² - b² = c²', isCorrect: false, count: 0, percentage: 0 },
          { id: 'opt-4', label: 'D', text: 'a × b = c', isCorrect: false, count: 0, percentage: 0 },
        ]
      },
      {
        questionId: 'mock-q2',
        questionIndex: 2,
        questionText: 'Bentuk umum persamaan kuadrat adalah...',
        questionType: 'multiple_choice',
        totalParticipants: 6,
        totalResponses: 6,
        unansweredCount: 0,
        unansweredPercent: 0,
        options: [
          { id: 'opt-5', label: 'A', text: 'ax² + bx + c = 0', isCorrect: true, count: 4, percentage: 66.7 },
          { id: 'opt-6', label: 'B', text: 'ax + b = 0', isCorrect: false, count: 2, percentage: 33.3 },
          { id: 'opt-7', label: 'C', text: 'ax³ + bx² + c = 0', isCorrect: false, count: 0, percentage: 0 },
        ]
      }
    ];

    setStudentStats(stats);
    setQuestionStats(qStats);
    setQuestionDistributions(mockDistributions);
  };

  useEffect(() => {
    const loadAnalyticsData = async () => {
      if (!profile?.id) return;
      setLoading(true);
      setAnalyticsState('loading');
      setErrorInfo(null);

      if (isMock) {
        const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
        const current = allQuizzes.find(q => q.id === (quizIdParam || 'mock-quiz'));
        if (!current) {
          setAnalyticsState('not_found');
          setErrorInfo({
            title: 'Kuis Tidak Ditemukan',
            message: 'Kuis tidak ditemukan dalam penyimpanan data lokal.',
            status: 404
          });
          setLoading(false);
          return;
        }

        if (current.teacher_id !== profile?.id && profile?.role !== 'admin') {
          setAnalyticsState('access_denied');
          setErrorInfo({
            title: 'Akses Ditolak',
            message: 'Anda tidak memiliki izin untuk melihat analitik kuis ini.',
            status: 403
          });
          setLoading(false);
          return;
        }

        setQuiz(current);
        generateMockAnalytics();
        setAnalyticsState('success');
        setLoading(false);
        return;
      }

      // Online API flow
      try {
        let activeQuizId = quizIdParam;
        let resolvedSession: QuizSession | null = null;

        // If no quizId in URL but sessionId is present, load session first
        if (!activeQuizId && sessionIdParam) {
          const sRes = await SessionService.getSession(sessionIdParam);
          if (!sRes.success || !sRes.data) {
            const is403 = sRes.status === 403 || 
              (typeof sRes.error === 'string' && (
                sRes.error.toLowerCase().includes('akses ditolak') || 
                sRes.error.toLowerCase().includes('tidak memiliki izin') || 
                sRes.error.toLowerCase().includes('forbidden')
              ));
            if (is403) {
              setAnalyticsState('access_denied');
              setErrorInfo({
                title: 'Akses Ditolak',
                message: 'Anda tidak memiliki izin untuk melihat analitik kuis ini.',
                status: 403
              });
              setLoading(false);
              return;
            }
            if (sRes.status === 401) {
              setAnalyticsState('unauthorized');
              navigate('/login');
              return;
            }
            if (sRes.status === 404) {
              setAnalyticsState('not_found');
              setErrorInfo({
                title: 'Sesi Tidak Ditemukan',
                message: 'Sesi kuis tidak ditemukan.',
                status: 404
              });
              setLoading(false);
              return;
            }
            setAnalyticsState('error');
            setErrorInfo({
              title: 'Terjadi Kesalahan Server',
              message: typeof sRes.error === 'string' ? sRes.error : 'Gagal memuat sesi kuis.',
              status: sRes.status || 500
            });
            setLoading(false);
            return;
          }

          resolvedSession = sRes.data;
          activeQuizId = sRes.data.quiz_id;
        }

        if (!activeQuizId) {
          setAnalyticsState('not_found');
          setErrorInfo({
            title: 'Kuis Tidak Ditemukan',
            message: 'ID kuis atau ID sesi wajib disertakan.',
            status: 404
          });
          setLoading(false);
          return;
        }

        const quizRes = await QuizService.getQuizById(activeQuizId);
        if (!quizRes.success || !quizRes.data) {
          const is403 = quizRes.status === 403 || 
            (typeof quizRes.error === 'string' && (
              quizRes.error.toLowerCase().includes('akses ditolak') || 
              quizRes.error.toLowerCase().includes('tidak memiliki izin') || 
              quizRes.error.toLowerCase().includes('forbidden')
            ));
          if (is403) {
            setAnalyticsState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Anda tidak memiliki izin untuk melihat analitik kuis ini.',
              status: 403
            });
            setLoading(false);
            return;
          }
          if (quizRes.status === 401) {
            setAnalyticsState('unauthorized');
            navigate('/login');
            return;
          }
          if (quizRes.status === 404) {
            setAnalyticsState('not_found');
            setErrorInfo({
              title: 'Kuis Tidak Ditemukan',
              message: 'Kuis yang dicari tidak ditemukan.',
              status: 404
            });
            setLoading(false);
            return;
          }
          setAnalyticsState('error');
          setErrorInfo({
            title: 'Terjadi Kesalahan Server',
            message: typeof quizRes.error === 'string' ? quizRes.error : 'Gagal memuat data kuis.',
            status: quizRes.status || 500
          });
          setLoading(false);
          return;
        }

        const quizData = quizRes.data;
        if (profile?.role !== 'admin' && quizData.teacher_id !== profile?.id) {
          setAnalyticsState('access_denied');
          setErrorInfo({
            title: 'Akses Ditolak',
            message: 'Anda tidak memiliki izin untuk melihat analitik kuis ini.',
            status: 403
          });
          setLoading(false);
          return;
        }
        setQuiz(quizData as Quiz);

        // Fetch all sessions for this quiz
        const sessionsRes = await SessionService.getSessionsByQuizId(activeQuizId);
        if (!sessionsRes.success) {
          const is403 = sessionsRes.status === 403 || 
            (typeof sessionsRes.error === 'string' && (
              sessionsRes.error.toLowerCase().includes('akses ditolak') || 
              sessionsRes.error.toLowerCase().includes('tidak memiliki izin') || 
              sessionsRes.error.toLowerCase().includes('forbidden')
            ));
          if (is403) {
            setAnalyticsState('access_denied');
            setErrorInfo({
              title: 'Akses Ditolak',
              message: 'Anda tidak memiliki izin untuk melihat analitik kuis ini.',
              status: 403
            });
            setLoading(false);
            return;
          }
        }

        const allSessions = sessionsRes.data || [];
        setQuizSessions(allSessions);

        // Determine target session
        let targetSession: QuizSession | null = resolvedSession;
        if (!targetSession && sessionIdParam) {
          targetSession = allSessions.find(s => s.id === sessionIdParam) || null;
        }
        if (!targetSession && allSessions.length > 0) {
          targetSession = allSessions[0]; // default to latest session
        }

        const currentSessionId = targetSession ? targetSession.id : (sessionIdParam || '');
        setSelectedSessionId(currentSessionId);

        if (!currentSessionId) {
          setStudentStats([]);
          setQuestionStats([]);
          setQuestionDistributions([]);
          setAverageScore(null);
          setValidCompletedCount(0);
          setAnalyticsState('empty');
          setLoading(false);
          return;
        }

        // Fetch participants strictly for this session (prevents cross-session contamination)
        const participantsRes = await ParticipantService.getParticipants(currentSessionId);
        const rawParticipants = participantsRes.data || [];

        // Deduplicate participants
        const seenPartKeys = new Set<string>();
        const participants: Participant[] = [];
        for (const p of rawParticipants) {
          const key = p.student_id ? `student_${p.student_id}` : `part_${p.id}`;
          if (!seenPartKeys.has(key)) {
            seenPartKeys.add(key);
            participants.push(p);
          }
        }

        if (participants.length === 0) {
          setStudentStats([]);
          setQuestionStats([]);
          setQuestionDistributions([]);
          setAverageScore(null);
          setValidCompletedCount(0);
          setAnalyticsState('empty');
          setLoading(false);
          return;
        }

        // Fetch questions for this quiz
        const questionsRes = await QuestionService.getQuestions(activeQuizId);
        const questions = questionsRes.data || [];
        const qIds = questions.map(q => q.id);

        // Fetch options for all questions
        let allOptions: Option[] = [];
        if (qIds.length > 0) {
          const optionsRes = await QuestionService.getOptionsForQuestions(qIds);
          allOptions = optionsRes.data || [];
        }

        // Fetch answers for this session's participants
        const partIds = participants.map(p => p.id);
        let activeAnswers: Answer[] = [];
        if (partIds.length > 0) {
          const answersRes = await AnswerService.getAnswersByParticipantIds(partIds);
          activeAnswers = (answersRes.data as Answer[]) || [];
        }

        // 1. FITUR A: Hitung Rata-rata Nilai Peserta
        // Peserta relevan dengan hasil final: is_completed === true atau sesi telah completed/finished
        const sessionIsDone = targetSession?.status === 'completed' || targetSession?.current_stage === 'finished';
        const finalParticipants = participants.filter(p => !!p.is_completed || sessionIsDone);

        if (finalParticipants.length > 0) {
          const totalScore = finalParticipants.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
          const rawAvg = totalScore / finalParticipants.length;
          const roundedAvg = Math.round(rawAvg * 10) / 10;
          setAverageScore(roundedAvg);
          setValidCompletedCount(finalParticipants.length);
        } else {
          setAverageScore(null); // Menampilkan '—'
          setValidCompletedCount(0);
        }

        // 2. Hasil Penilaian Individu Siswa (Tabel)
        const stats: StudentStat[] = participants.map(p => {
          const pAnswers = activeAnswers.filter(a => a.participant_id === p.id);
          const correct = pAnswers.filter(a => a.is_correct).length;
          const incorrect = pAnswers.length - correct;
          const total = pAnswers.length || 1;

          return {
            rank: 0,
            name: p.display_name,
            score: p.score,
            correct,
            incorrect,
            accuracy: Math.round((correct / total) * 100)
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((s, idx) => ({ ...s, rank: idx + 1 }));

        setStudentStats(stats);

        // 3. Persentase Akurasi per Soal (Bar chart)
        const qStats: QuestionStat[] = questions.map((q, idx) => {
          const qAnswers = activeAnswers.filter(a => a.question_id === q.id);
          const correct = qAnswers.filter(a => a.is_correct).length;
          const total = qAnswers.length || 1;

          return {
            questionText: `Soal #${idx + 1}: ${q.question_text.slice(0, 30)}...`,
            correctCount: correct,
            totalAnswers: qAnswers.length,
            correctPercent: Math.round((correct / total) * 100)
          };
        });

        setQuestionStats(qStats);

        // 4. FITUR B: Sebaran Pilihan Jawaban per Soal
        const distributions: QuestionDistribution[] = questions.map((q, idx) => {
          const qOptions = allOptions.filter(o => o.question_id === q.id);
          const rawQAnswers = activeAnswers.filter(a => a.question_id === q.id);

          // Deduplicate answers per participant for this question
          const participantAnswerMap = new Map<string, Answer>();
          for (const a of rawQAnswers) {
            participantAnswerMap.set(a.participant_id, a);
          }

          const optionCounts: Record<string, number> = {};
          qOptions.forEach(opt => {
            optionCounts[opt.id] = 0;
          });

          let unansweredCount = 0;
          let totalResponses = 0;

          participants.forEach(p => {
            const ans = participantAnswerMap.get(p.id);
            if (!ans) {
              unansweredCount++;
              return;
            }

            if (q.question_type === 'multiple_answer') {
              const ids = ans.selected_option_ids || [];
              if (ids.length === 0) {
                unansweredCount++;
              } else {
                totalResponses++;
                ids.forEach(optId => {
                  if (optionCounts[optId] !== undefined) {
                    optionCounts[optId]++;
                  }
                });
              }
            } else {
              const optId = ans.selected_option_id;
              if (!optId || optionCounts[optId] === undefined) {
                unansweredCount++;
              } else {
                totalResponses++;
                optionCounts[optId]++;
              }
            }
          });

          const denominator = participants.length;

          const mappedOptions: OptionDistribution[] = qOptions.map((opt, optIdx) => {
            const count = optionCounts[opt.id] || 0;
            const percentage = denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
            return {
              id: opt.id,
              label: String.fromCharCode(65 + optIdx),
              text: opt.option_text,
              isCorrect: !!opt.is_correct,
              count,
              percentage,
            };
          });

          const unansweredPercent = denominator > 0 ? Math.round((unansweredCount / denominator) * 1000) / 10 : 0;

          return {
            questionId: q.id,
            questionIndex: idx + 1,
            questionText: q.question_text,
            questionType: q.question_type || 'multiple_choice',
            totalParticipants: denominator,
            totalResponses,
            unansweredCount,
            unansweredPercent,
            options: mappedOptions,
          };
        });

        setQuestionDistributions(distributions);
        setAnalyticsState('success');
      } catch (err: any) {
        console.error('Error fetching analytics:', err);
        setAnalyticsState('error');
        setErrorInfo({
          title: 'Terjadi Kesalahan Server',
          message: err?.message || 'Terjadi kesalahan sistem saat memproses data analitik.',
          status: 500
        });
      } finally {
        setLoading(false);
      }
    };

    loadAnalyticsData();
  }, [quizIdParam, sessionIdParam, profile?.id]);

  const handleSessionChange = (newSessionId: string) => {
    setSelectedSessionId(newSessionId);
    if (quiz) {
      setSearchParams({ id: quiz.id, session_id: newSessionId });
    }
  };

  const handleExportCSV = () => {
    if (!quiz) return;
    const filename = `analytics-${quiz.title.toLowerCase().replace(/\s+/g, '-')}`;
    const headers = ['Peringkat', 'Nama Murid', 'Skor Total', 'Jawaban Benar', 'Jawaban Salah', 'Akurasi (%)'];
    const rows = studentStats.map(s => [
      s.rank.toString(),
      s.name,
      s.score.toString(),
      s.correct.toString(),
      s.incorrect.toString(),
      `${s.accuracy}%`
    ]);

    exportToCSV(filename, headers, rows);
  };

  const handleExportExcel = () => {
    if (!quiz) return;
    const filename = `analytics-${quiz.title.toLowerCase().replace(/\s+/g, '-')}`;
    const headers = ['Peringkat', 'Nama Murid', 'Skor Total', 'Jawaban Benar', 'Jawaban Salah', 'Akurasi (%)'];
    const rows = studentStats.map(s => [
      s.rank.toString(),
      s.name,
      s.score.toString(),
      s.correct.toString(),
      s.incorrect.toString(),
      `${s.accuracy}%`
    ]);

    exportToExcel(filename, headers, rows);
  };

  const handleExportPDF = () => {
    if (!quiz) return;
    const filename = `analytics-${quiz.title.toLowerCase().replace(/\s+/g, '-')}`;
    const title = `Hasil Evaluasi: ${quiz.title}`;
    const headers = ['Peringkat', 'Nama Murid', 'Skor Total', 'Benar', 'Salah', 'Akurasi'];
    const rows = studentStats.map(s => [
      s.rank.toString(),
      s.name,
      s.score.toString(),
      s.correct.toString(),
      s.incorrect.toString(),
      `${s.accuracy}%`
    ]);

    exportToPDF(filename, title, headers, rows);
  };

  const avgAccuracy = Math.round(studentStats.reduce((acc, curr) => acc + curr.accuracy, 0) / (studentStats.length || 1));

  if (loading || analyticsState === 'loading') {
    return (
      <div data-testid="loading-container" className="flex h-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div data-testid="loading-spinner" className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Memuat data analitik kuis...</p>
        </div>
      </div>
    );
  }

  if (analyticsState === 'access_denied') {
    return (
      <div className="min-h-screen p-6 bg-mesh flex flex-col justify-center">
        <div 
          data-testid="access-denied-container" 
          className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12"
        >
          <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-rose-500/5">
            <ShieldAlert className="h-10 w-10 animate-bounce" />
          </div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
            HTTP 403
          </div>

          <h2 data-testid="error-title" className="text-2xl font-black text-foreground mb-2">
            {errorInfo?.title || 'Akses Ditolak'}
          </h2>
          <p data-testid="error-message" className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
            {errorInfo?.message || 'Anda tidak memiliki izin untuk melihat analitik kuis ini.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              data-testid="btn-back-dashboard"
              type="button"
              onClick={() => navigate('/teacher/dashboard')}
              className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (analyticsState === 'not_found') {
    return (
      <div className="min-h-screen p-6 bg-mesh flex flex-col justify-center">
        <div 
          data-testid="not-found-container" 
          className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12"
        >
          <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-amber-500/5">
            <FileQuestion className="h-10 w-10 animate-pulse" />
          </div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
            HTTP 404
          </div>

          <h2 data-testid="error-title" className="text-2xl font-black text-foreground mb-2">
            {errorInfo?.title || 'Kuis Tidak Ditemukan'}
          </h2>
          <p data-testid="error-message" className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
            {errorInfo?.message || 'Kuis atau sesi kuis yang dicari tidak ditemukan.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              data-testid="btn-back-dashboard"
              type="button"
              onClick={() => navigate('/teacher/dashboard')}
              className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (analyticsState === 'error') {
    return (
      <div className="min-h-screen p-6 bg-mesh flex flex-col justify-center">
        <div 
          data-testid="error-container" 
          className="flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center animate-fade-in my-12"
        >
          <div className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-destructive/10 text-destructive border border-destructive/20 shadow-destructive/5">
            <AlertTriangle className="h-10 w-10 animate-pulse" />
          </div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 tracking-wide uppercase bg-muted text-muted-foreground border border-border">
            {errorInfo?.status ? `HTTP ${errorInfo.status}` : 'HTTP 500'}
          </div>

          <h2 data-testid="error-title" className="text-2xl font-black text-foreground mb-2">
            {errorInfo?.title || 'Terjadi Kesalahan Server'}
          </h2>
          <p data-testid="error-message" className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
            {errorInfo?.message || 'Gagal memuat analitik kuis karena kendala pada server.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              data-testid="btn-back-dashboard"
              type="button"
              onClick={() => navigate('/teacher/dashboard')}
              className="w-full py-3.5 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition shadow-lg shadow-primary/20 cursor-pointer"
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-mesh">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/teacher/dashboard')}
              className="p-2.5 rounded-xl border hover:bg-muted text-foreground transition cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground">Analisis Kuis</h1>
              <p className="text-xs text-muted-foreground">Laporan ringkas akurasi dan kinerja pemahaman murid</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
            <ThemeToggle />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-background border hover:bg-muted text-foreground px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                title="Ekspor Dokumen Excel (XLS)"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Excel (XLS)
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 rounded-xl bg-background border hover:bg-muted text-foreground px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                title="Ekspor Spreadsheet (CSV)"
              >
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 rounded-xl bg-background border hover:bg-muted text-foreground px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                title="Ekspor Berkas Cetak (PDF)"
              >
                <FileText className="h-4 w-4 text-red-500" />
                Laporan (PDF)
              </button>
            </div>
          </div>
        </div>

        {quiz && (
          <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">{quiz.title}</h2>
              <p className="text-sm text-muted-foreground">{quiz.description || 'Tidak ada deskripsi.'}</p>
            </div>

            {/* Session Selector */}
            {quizSessions.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Sesi:
                </span>
                <select
                  data-testid="session-selector"
                  value={selectedSessionId}
                  onChange={(e) => handleSessionChange(e.target.value)}
                  className="rounded-xl border border-input bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  {quizSessions.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      Sesi {quizSessions.length - idx} (PIN: {s.pin_code || s.quiz?.pin_code || quiz?.pin_code || '—'}) • {s.status.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Empty state when legitimate quiz has 0 participants */}
        {analyticsState === 'empty' ? (
          <div data-testid="empty-state-container" className="glass-panel p-12 rounded-3xl text-center space-y-4 my-6 border border-dashed border-border/80">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Belum Ada Data Peserta</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Belum ada peserta yang bergabung atau menyelesaikan pengerjaan untuk kuis ini. Statistik akan otomatis muncul setelah kuis dimainkan oleh siswa.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition cursor-pointer"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Metrics Grid: 4 Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-2xl shadow-sm flex items-center gap-3.5" data-testid="stat-total-participants">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Partisipan</span>
              <h3 className="text-xl font-black text-foreground">{studentStats.length} Siswa</h3>
            </div>
          </div>

          {/* FITUR A: Rata-rata Nilai Peserta */}
          <div className="glass-panel p-5 rounded-2xl shadow-sm flex items-center gap-3.5" data-testid="stat-average-score">
            <div className="h-11 w-11 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rata-rata Nilai</span>
              <h3 className="text-xl font-black text-foreground">
                {averageScore !== null ? `${averageScore} Pts` : '—'}
              </h3>
              <p className="text-[10px] text-muted-foreground font-medium">
                {validCompletedCount > 0 ? `${validCompletedCount} peserta selesai` : 'Belum ada hasil final'}
              </p>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl shadow-sm flex items-center gap-3.5" data-testid="stat-average-accuracy">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rata-rata Akurasi</span>
              <h3 className="text-xl font-black text-foreground">{avgAccuracy || 0}%</h3>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl shadow-sm flex items-center gap-3.5" data-testid="stat-highest-score">
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Skor Tertinggi</span>
              <h3 className="text-xl font-black text-foreground">
                {studentStats.length > 0 ? `${studentStats[0].score} Pts` : '0 Pts'}
              </h3>
            </div>
          </div>
        </div>

        {/* Persentase Akurasi per Soal (Bar chart) */}
        {questionStats.length > 0 && (
          <div className="glass-panel p-6 rounded-3xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Persentase Akurasi per Soal
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={questionStats}>
                  <XAxis dataKey="questionText" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }} 
                    formatter={(val) => [`${val}%`, 'Akurasi']}
                  />
                  <Bar dataKey="correctPercent" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* FITUR B: Sebaran Pilihan Jawaban per Soal */}
        <div className="space-y-4" data-testid="section-answer-distribution">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-500" />
              Sebaran Pilihan Jawaban per Soal
            </h3>
            <p className="text-xs text-muted-foreground">
              Distribusi opsi murid beserta kunci jawaban dan kategori tidak dijawab
            </p>
          </div>

          {questionDistributions.length === 0 ? (
            <div className="glass-panel p-8 rounded-3xl text-center text-muted-foreground text-sm font-semibold">
              Belum ada data distribusi pilihan jawaban untuk kuis ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {questionDistributions.map((qDist) => (
                <div 
                  key={qDist.questionId}
                  data-testid={`question-distribution-${qDist.questionIndex}`}
                  className="glass-panel p-5 rounded-2xl shadow-sm border border-border/80 space-y-3.5"
                >
                  {/* Question Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary">
                          Soal #{qDist.questionIndex}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                          {qDist.questionType.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-foreground leading-snug">
                        {qDist.questionText}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {qDist.totalResponses} / {qDist.totalParticipants}
                      </span>
                      <span>menjawab</span>
                    </div>
                  </div>

                  {/* Options Distribution List */}
                  <div className="space-y-2.5">
                    {qDist.options.map((opt) => (
                      <div 
                        key={opt.id}
                        data-testid={`option-item-${qDist.questionIndex}-${opt.label}`}
                        className={`p-3 rounded-xl border transition-all ${
                          opt.isCorrect 
                            ? 'bg-emerald-500/5 border-emerald-500/25 ring-1 ring-emerald-500/15' 
                            : 'bg-muted/20 border-border/60 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded-md text-[11px] font-black ${
                              opt.isCorrect 
                                ? 'bg-emerald-500 text-white' 
                                : 'bg-primary/15 text-primary'
                            }`}>
                              {opt.label}
                            </span>
                            <span className="font-medium text-foreground">{opt.text}</span>
                            {opt.isCorrect && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" />
                                Kunci Jawaban
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 font-bold text-foreground shrink-0 text-right">
                            <span>{opt.count} murid</span>
                            <span className={`text-[11px] px-1.5 py-0.5 rounded font-black ${
                              opt.isCorrect ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-foreground'
                            }`}>
                              {opt.percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              opt.isCorrect ? 'bg-emerald-500' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, opt.percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}

                    {/* Unanswered / Timeout Row */}
                    <div 
                      data-testid={`option-item-${qDist.questionIndex}-unanswered`}
                      className="p-2.5 rounded-xl border border-dashed border-border/80 bg-muted/10 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-black bg-zinc-500/20 text-zinc-600 dark:text-zinc-400">
                            —
                          </span>
                          <span className="font-medium text-muted-foreground flex items-center gap-1">
                            <HelpCircle className="h-3.5 w-3.5" />
                            Tidak Dijawab / Timeout
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-bold text-muted-foreground shrink-0 text-right">
                          <span>{qDist.unansweredCount} murid</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded font-black bg-muted text-muted-foreground">
                            {qDist.unansweredPercent}%
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-zinc-400 dark:bg-zinc-600 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, qDist.unansweredPercent))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Denominator Caption */}
                  <p className="text-[10px] text-muted-foreground italic font-medium pt-1">
                    *Persentase dihitung berdasarkan total {qDist.totalParticipants} peserta pada sesi ini.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Student Score Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Hasil Penilaian Individu Siswa
          </h3>

          <div className="glass-panel rounded-3xl shadow-sm border overflow-hidden">
            {studentStats.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm font-semibold">
                Belum ada siswa yang menyelesaikan kuis ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold">
                      <th className="px-6 py-4">Peringkat</th>
                      <th className="px-6 py-4">Nama Siswa</th>
                      <th className="px-6 py-4">Akurasi</th>
                      <th className="px-6 py-4">Jawaban Benar</th>
                      <th className="px-6 py-4">Jawaban Salah</th>
                      <th className="px-6 py-4 text-right">Skor Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm font-semibold">
                    {studentStats.map((student) => (
                      <tr key={student.rank} className="hover:bg-muted/5 transition">
                        <td className="px-6 py-4 text-foreground">
                          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black ${
                            student.rank === 1 ? 'bg-yellow-400 text-yellow-950' : 
                            student.rank === 2 ? 'bg-zinc-300 text-zinc-800' : 
                            student.rank === 3 ? 'bg-amber-600 text-amber-50' : 'bg-muted text-muted-foreground'
                          }`}>
                            {student.rank}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-foreground">
                          <div className="flex items-center gap-2">
                            <img
                              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`}
                              alt="avatar"
                              className="h-7 w-7 rounded-full border"
                            />
                            <span>{student.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                            student.accuracy >= 80 ? 'bg-green-500/10 text-green-600' :
                            student.accuracy >= 50 ? 'bg-yellow-500/10 text-yellow-600' :
                            'bg-red-500/10 text-red-600'
                          }`}>
                            {student.accuracy}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-green-600">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            {student.correct}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-destructive">
                          <span className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 shrink-0" />
                            {student.incorrect}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-primary font-black">{student.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
          </>
        )}

      </div>
    </div>
  );
};
