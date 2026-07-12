import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { QuizService } from '@/features/quiz/services/quiz.service';
import { SessionService } from '@/features/session/services/session.service';
import { ParticipantService } from '@/features/participant/services/participant.service';
import { QuestionService } from '@/features/question/services/question.service';
import { AnswerService } from '@/features/answer/services/answer.service';
import type { Quiz, Answer } from '@/types';
import { exportToCSV, exportToPDF } from '@/shared/utils/export';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowLeft, FileSpreadsheet, FileText, CheckCircle, XCircle, Award, Users, BarChart3 } from 'lucide-react';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { showError } from '@/shared/utils/swal';

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

export const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('id');
  const { isMock, profile } = useAuthStore();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [loading, setLoading] = useState(false);

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

    const qStats: QuestionStat[] = [
      { questionText: 'Soal #1: Rumus Pythagoras', correctCount: 5, totalAnswers: 6, correctPercent: 83 },
      { questionText: 'Soal #2: Persamaan Kuadrat', correctCount: 4, totalAnswers: 6, correctPercent: 66 },
      { questionText: 'Soal #3: Monumen Terkenal', correctCount: 3, totalAnswers: 6, correctPercent: 50 },
      { questionText: 'Soal #4: Genre Musik Instrumen', correctCount: 3, totalAnswers: 6, correctPercent: 50 },
    ];

    setStudentStats(stats);
    setQuestionStats(qStats);
  };

  useEffect(() => {
    const loadAnalyticsData = async () => {
      if (!quizId || !profile?.id) return;
      setLoading(true);

      if (isMock) {
        const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
        const current = allQuizzes.find(q => q.id === quizId);
        if (current) {
          if (current.teacher_id !== profile?.id) {
            showError('Akses Ditolak', 'Anda tidak memiliki hak untuk melihat analisis kuis ini!');
            navigate('/teacher/dashboard');
            return;
          }
          setQuiz(current);
          generateMockAnalytics();
        }
        setLoading(false);
        return;
      }

      // Online Supabase flow
      try {
        const quizRes = await QuizService.getQuizById(quizId);
        const quizData = quizRes.data;

        if (quizData) {
          if (quizData.teacher_id !== profile?.id) {
            showError('Akses Ditolak', 'Anda tidak memiliki hak untuk melihat analisis kuis ini!');
            navigate('/teacher/dashboard');
            return;
          }
          setQuiz(quizData as Quiz);

          // Get active or completed sessions for this quiz
          const sessionIdsRes = await SessionService.getQuizSessionIds(quizId);
          const sessions = sessionIdsRes.data;

          if (sessions && sessions.length > 0) {
            const sessionIds = sessions.map(s => s.id);

            // Fetch participants
            const participantsRes = await ParticipantService.getParticipantsBySessionIds(sessionIds);
            const participants = participantsRes.data;

            // Fetch questions
            const questionsRes = await QuestionService.getQuestions(quizId);
            const questions = questionsRes.data;

            if (participants && participants.length > 0 && questions) {
              const partIds = participants.map(p => p.id);
              
              // Fetch answers
              const answersRes = await AnswerService.getAnswersByParticipantIds(partIds);
              const answers = answersRes.data;

              const activeAnswers = (answers as Answer[]) || [];

              // Calculate stats per participant
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

              // Calculate stats per question
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
            }
          }
        }
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAnalyticsData();
  }, [quizId, profile?.id]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Memuat data analitik kuis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-mesh">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation header */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/teacher/dashboard')}
              className="p-2.5 rounded-xl border hover:bg-muted text-foreground transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground">Analisis Kuis</h1>
              <p className="text-xs text-muted-foreground">Laporan ringkas akurasi dan kinerja pemahaman murid</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 rounded-xl bg-background border hover:bg-muted text-foreground px-3.5 py-2 text-xs font-bold transition"
                title="Ekspor Spreadsheet Excel (CSV)"
              >
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Excel (CSV)
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 rounded-xl bg-background border hover:bg-muted text-foreground px-3.5 py-2 text-xs font-bold transition"
                title="Ekspor Berkas Cetak (PDF)"
              >
                <FileText className="h-4 w-4 text-red-500" />
                Laporan (PDF)
              </button>
            </div>
          </div>
        </div>

        {quiz && (
          <div className="glass-panel p-6 rounded-3xl">
            <h2 className="text-xl font-bold text-foreground">{quiz.title}</h2>
            <p className="text-sm text-muted-foreground">{quiz.description || 'Tidak ada deskripsi.'}</p>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Partisipan</span>
              <h3 className="text-2xl font-black text-foreground">{studentStats.length} Siswa</h3>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Rata-rata Akurasi</span>
              <h3 className="text-2xl font-black text-foreground">{avgAccuracy || 0}%</h3>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-yellow-500/10 text-yellow-600 flex items-center justify-center shrink-0">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Skor Tertinggi</span>
              <h3 className="text-2xl font-black text-foreground">
                {studentStats.length > 0 ? `${studentStats[0].score} Pts` : '0 Pts'}
              </h3>
            </div>
          </div>
        </div>

        {/* Question accuracy bar chart */}
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
                        <td className="px-6 py-4 text-foreground flex items-center gap-2">
                          <img
                            src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`}
                            alt="avatar"
                            className="h-7 w-7 rounded-full border"
                          />
                          <span>{student.name}</span>
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

      </div>
    </div>
  );
};
