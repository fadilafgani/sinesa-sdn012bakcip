import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, checkIsMock } from '../../store/auth-store';
import { supabase } from '../../lib/supabase';
import type { Quiz, Question, Option } from '../../types';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  ArrowLeft, Plus, Trash2, Save, Image, Volume2, Type, Sigma, 
  UploadCloud, ChevronRight, CheckCircle2, Play, Video
} from 'lucide-react';
import { LatexRenderer } from '../../components/latex-renderer';
import { ThemeToggle } from '../../components/theme-toggle';
import { showError } from '../../lib/swal';
import { mediaStorageService } from '../../services/media-storage';
import { LazyImage } from '../../components/lazy-image';
import { getSafeMediaUrl } from '../../lib/media';

// Validation Schema using Zod
const optionSchema = z.object({
  id: z.string().optional(),
  option_text: z.string().min(1, 'Jawaban pilihan tidak boleh kosong'),
  is_correct: z.boolean().default(false),
  match_text: z.string().optional().nullable(),
});

const questionSchema = z.object({
  id: z.string().optional(),
  question_text: z.string().min(3, 'Pertanyaan minimal harus 3 karakter'),
  question_type: z.enum(['multiple_choice', 'true_false', 'multiple_answer', 'matching']).default('multiple_choice'),
  media_type: z.enum(['text', 'image', 'audio', 'video', 'latex']),
  media_url: z.string().nullable().optional(),
  points: z.coerce.number().min(10).max(10000).default(100),
  explanation: z.string().optional().nullable(),
  options: z.array(optionSchema).min(2, 'Minimal harus ada 2 opsi pilihan').max(6, 'Maksimal 6 opsi pilihan'),
});

const quizFormSchema = z.object({
  title: z.string().min(3, 'Judul kuis minimal harus 3 karakter'),
  description: z.string().optional(),
  opening_text: z.string().optional(),
  closing_text: z.string().optional(),
  duration_per_question: z.coerce.number().min(5).max(300).default(30),
  random_questions: z.boolean().default(false),
  random_options: z.boolean().default(false),
  thumbnail_url: z.string().nullable().optional(),
  quiz_mode: z.enum(['serius', 'santai']).default('serius'),
  lives_count: z.coerce.number().min(0).max(10).default(3),
  show_final_result: z.boolean().default(true),
  show_leaderboard: z.boolean().default(true),
  show_correct_answer: z.boolean().default(true),
  show_answer_review: z.boolean().default(true),
  show_question_result: z.boolean().default(true),
  show_explanation: z.boolean().default(true),
  show_score_per_question: z.boolean().default(true),
  show_question_statistics: z.boolean().default(true),
  anti_cheat_enabled: z.boolean().default(false),
  fullscreen_required: z.boolean().default(false),
  auto_submit_on_violation: z.coerce.number().min(1).max(10).default(3),
  questions: z.array(questionSchema).min(1, 'Kuis harus memiliki minimal 1 soal'),
});

type QuizFormValues = z.infer<typeof quizFormSchema>;

const ToggleSwitch = ({ label, description, name, register, disabled = false }: any) => {
  return (
    <label className={`flex items-center justify-between gap-3 py-2 cursor-pointer select-none ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      <div className="flex-1 col-span-1">
        <span className="text-xs font-bold text-foreground block">{label}</span>
        {description && <span className="text-[10px] text-muted-foreground block font-semibold leading-relaxed">{description}</span>}
      </div>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          disabled={disabled}
          {...register(name)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
      </div>
    </label>
  );
};

export const QuizEditor: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isMock, profile } = useAuthStore();
  const quizId = searchParams.get('id');
  const isNew = searchParams.get('new') === 'true';

  const [loading, setLoading] = useState(false);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  // Form setup
  const { register, control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<any>({
    resolver: zodResolver(quizFormSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      opening_text: '',
      closing_text: '',
      duration_per_question: 30,
      random_questions: false,
      random_options: false,
      thumbnail_url: '',
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
      questions: [
        {
          question_text: '',
          question_type: 'multiple_choice',
          media_type: 'text',
          media_url: '',
          points: 100,
          options: [
            { option_text: '', is_correct: true, match_text: '' },
            { option_text: '', is_correct: false, match_text: '' },
          ]
        }
      ]
    }
  });

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control,
    name: 'questions'
  });

  // Watch values for live rendering
  const watchedQuestions = watch('questions');
  const currentWatchedQuestion = watchedQuestions?.[activeQuestionIndex];

  // Fetch or setup quiz
  useEffect(() => {
    const loadQuizData = async () => {
      if (isNew || !quizId) return;

      setLoading(true);
      if (isMock) {
        // Load mock quiz
        const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
        const current = allQuizzes.find(q => q.id === quizId);
        
        if (current) {
          if (current.teacher_id !== profile?.id) {
            showError('Akses Ditolak', 'Anda tidak memiliki hak untuk menyunting kuis ini!');
            navigate('/teacher/dashboard');
            return;
          }
          const rawQs: Question[] = JSON.parse(localStorage.getItem(`questions_${quizId}`) || '[]');
          
          // Load options for each question
          const formattedQuestions = rawQs.map(q => {
            const rawOpts: Option[] = JSON.parse(localStorage.getItem(`options_${q.id}`) || '[]');
            return {
              id: q.id,
              question_text: q.question_text,
              question_type: (q as any).question_type || 'multiple_choice',
              media_type: q.media_type,
              media_url: q.media_url,
              points: q.points,
              explanation: q.explanation || '',
              options: rawOpts.map(o => ({
                id: o.id,
                option_text: o.option_text,
                is_correct: o.is_correct,
                match_text: (o as any).match_text || ''
              }))
            };
          });

          reset({
            title: current.title,
            description: current.description || '',
            opening_text: current.opening_text || '',
            closing_text: current.closing_text || '',
            duration_per_question: current.duration_per_question,
            random_questions: current.random_questions,
            random_options: current.random_options,
            thumbnail_url: current.thumbnail_url || '',
            quiz_mode: current.quiz_mode || 'serius',
            lives_count: current.lives_count !== undefined ? current.lives_count : 3,
            show_final_result: current.show_final_result !== undefined ? current.show_final_result : true,
            show_leaderboard: current.show_leaderboard !== undefined ? current.show_leaderboard : true,
            show_correct_answer: current.show_correct_answer !== undefined ? current.show_correct_answer : true,
            show_answer_review: current.show_answer_review !== undefined ? current.show_answer_review : true,
            show_question_result: current.show_question_result !== undefined ? current.show_question_result : true,
            show_explanation: current.show_explanation !== undefined ? current.show_explanation : true,
            show_score_per_question: current.show_score_per_question !== undefined ? current.show_score_per_question : true,
            show_question_statistics: current.show_question_statistics !== undefined ? current.show_question_statistics : true,
            anti_cheat_enabled: current.anti_cheat_enabled !== undefined ? current.anti_cheat_enabled : false,
            fullscreen_required: current.fullscreen_required !== undefined ? current.fullscreen_required : false,
            auto_submit_on_violation: current.auto_submit_on_violation !== undefined ? current.auto_submit_on_violation : 3,
            questions: formattedQuestions
          });
        }
        setLoading(false);
        return;
      }

      // Supabase Online Load
      try {
        const { data: quiz } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .single();

        if (quiz) {
          if (quiz.teacher_id !== profile?.id) {
            showError('Akses Ditolak', 'Anda tidak memiliki hak untuk menyunting kuis ini!');
            navigate('/teacher/dashboard');
            return;
          }
          const { data: rawQs } = await supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('order_index', { ascending: true });

          const formattedQuestions = [];
          if (rawQs) {
            for (const q of rawQs) {
              const { data: rawOpts } = await supabase
                .from('options')
                .select('*')
                .eq('question_id', q.id);

              formattedQuestions.push({
                id: q.id,
                question_text: q.question_text,
                question_type: (q as any).question_type || 'multiple_choice',
                media_type: q.media_type as 'text' | 'image' | 'audio' | 'video' | 'latex',
                media_url: q.media_url,
                points: q.points,
                explanation: q.explanation || '',
                options: (rawOpts || []).map(o => ({
                  id: o.id,
                  option_text: o.option_text,
                  is_correct: o.is_correct,
                  match_text: (o as any).match_text || ''
                }))
              });
            }
          }

          reset({
            title: quiz.title,
            description: quiz.description || '',
            opening_text: quiz.opening_text || '',
            closing_text: quiz.closing_text || '',
            duration_per_question: quiz.duration_per_question,
            random_questions: quiz.random_questions,
            random_options: quiz.random_options,
            thumbnail_url: quiz.thumbnail_url || '',
            quiz_mode: quiz.quiz_mode || 'serius',
            lives_count: quiz.lives_count !== undefined ? quiz.lives_count : 3,
            show_final_result: quiz.show_final_result !== undefined ? quiz.show_final_result : true,
            show_leaderboard: quiz.show_leaderboard !== undefined ? quiz.show_leaderboard : true,
            show_correct_answer: quiz.show_correct_answer !== undefined ? quiz.show_correct_answer : true,
            show_answer_review: quiz.show_answer_review !== undefined ? quiz.show_answer_review : true,
            show_question_result: quiz.show_question_result !== undefined ? quiz.show_question_result : true,
            show_explanation: quiz.show_explanation !== undefined ? quiz.show_explanation : true,
            show_score_per_question: quiz.show_score_per_question !== undefined ? quiz.show_score_per_question : true,
            show_question_statistics: quiz.show_question_statistics !== undefined ? quiz.show_question_statistics : true,
            anti_cheat_enabled: quiz.anti_cheat_enabled !== undefined ? quiz.anti_cheat_enabled : false,
            fullscreen_required: quiz.fullscreen_required !== undefined ? quiz.fullscreen_required : false,
            auto_submit_on_violation: quiz.auto_submit_on_violation !== undefined ? quiz.auto_submit_on_violation : 3,
            questions: formattedQuestions.length > 0 ? formattedQuestions : [
              {
                question_text: '',
                media_type: 'text',
                media_url: '',
                points: 100,
                options: [
                  { option_text: '', is_correct: true },
                  { option_text: '', is_correct: false },
                ]
              }
            ]
          });
        }
      } catch (err) {
        console.error('Error loading quiz data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadQuizData();
  }, [quizId, isNew, reset]);

  // File Upload using mediaStorageService (Server Upload)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'thumbnail' | 'media', qIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine type, constraints & bucket folders
    let uploadType: 'thumbnails' | 'quiz-images' | 'quiz-audio' | 'quiz-videos' = 'quiz-images';
    let maxLimit = 2 * 1024 * 1024;
    let limitLabel = '2 MB';

    if (type === 'thumbnail') {
      uploadType = 'thumbnails';
      maxLimit = 2 * 1024 * 1024;
      limitLabel = '2 MB';
    } else {
      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg'].includes(fileExt)) {
        uploadType = 'quiz-audio';
        maxLimit = 10 * 1024 * 1024;
        limitLabel = '10 MB';
      } else if (file.type.startsWith('video/') || ['.mp4', '.webm', '.mov', '.mkv'].includes(fileExt)) {
        uploadType = 'quiz-videos';
        maxLimit = 50 * 1024 * 1024;
        limitLabel = '50 MB';
      } else {
        uploadType = 'quiz-images';
        maxLimit = 2 * 1024 * 1024;
        limitLabel = '2 MB';
      }
    }

    if (file.size > maxLimit) {
      showError('Ukuran Berkas Terlalu Besar', `Maksimal ukuran berkas yang diunggah untuk tipe ini adalah ${limitLabel}.`);
      e.target.value = ''; // Reset file input
      return;
    }

    if (isMock) {
      // Mock File Upload: read as base64 string
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (type === 'thumbnail') {
          setValue('thumbnail_url', base64);
        } else if (type === 'media' && qIndex !== undefined) {
          setValue(`questions.${qIndex}.media_url`, base64);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    // Set uploading states
    const identifier = type === 'thumbnail' ? 'thumbnail' : `media-${qIndex}`;
    setUploadingType(identifier);
    setUploadProgress(0);
    setLoading(true);

    try {
      // Fetch old URL if exists, to replace it on the server
      const oldUrl = type === 'thumbnail' 
        ? watch('thumbnail_url') 
        : (qIndex !== undefined ? watch(`questions.${qIndex}.media_url`) : '');

      const result = await mediaStorageService.replace(file, oldUrl || '', {
        type: uploadType,
        onProgress: (p) => setUploadProgress(p)
      });

      if (!result.success) {
        throw new Error(result.message || 'Gagal mengunggah berkas ke server.');
      }

      if (type === 'thumbnail') {
        setValue('thumbnail_url', result.url);
      } else if (type === 'media' && qIndex !== undefined) {
        setValue(`questions.${qIndex}.media_url`, result.url);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      showError('Gagal', `Gagal mengunggah file ke server: ${err.message}`);
    } finally {
      setLoading(false);
      setUploadingType(null);
      setUploadProgress(null);
    }
  };

  const onSubmit = async (values: QuizFormValues) => {
    // Validate that every question has at least one correct option (except for matching questions)
    for (let i = 0; i < values.questions.length; i++) {
      const q = values.questions[i];
      if (q.question_type === 'matching') {
        const hasEmptyMatch = q.options.some(o => !o.match_text || o.match_text.trim() === '');
        if (hasEmptyMatch) {
          setMessage({ type: 'error', text: `Soal #${i + 1} (Pencocokan) harus memiliki pasangan (Item Kanan) untuk setiap item.` });
          setActiveQuestionIndex(i);
          return;
        }
      } else {
        const hasCorrect = q.options.some(o => o.is_correct);
        if (!hasCorrect) {
          setMessage({ type: 'error', text: `Soal #${i + 1} harus memiliki minimal satu pilihan jawaban benar.` });
          setActiveQuestionIndex(i);
          return;
        }
      }
    }

    setLoading(true);
    setMessage(null);

    const isMock = checkIsMock();
    const pin = Math.floor(100000 + Math.random() * 900000).toString();

    if (isMock) {
      // Mock Storage Flow
      const allQuizzes: Quiz[] = JSON.parse(localStorage.getItem('quizzes') || '[]');
      const id = quizId || `quiz-mock-${Date.now()}`;

      const newQuiz: Quiz = {
        id,
        teacher_id: 'mock-uuid-teacher',
        title: values.title,
        description: values.description || '',
        opening_text: values.opening_text || '',
        closing_text: values.closing_text || '',
        pin_code: quizId ? (allQuizzes.find(q => q.id === quizId)?.pin_code || pin) : pin,
        duration_per_question: values.duration_per_question,
        random_questions: values.random_questions,
        random_options: values.random_options,
        thumbnail_url: values.thumbnail_url || 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=80',
        quiz_mode: values.quiz_mode,
        lives_count: values.lives_count,
        show_final_result: values.show_final_result,
        show_leaderboard: values.show_leaderboard,
        show_correct_answer: values.show_correct_answer,
        show_answer_review: values.show_answer_review,
        show_question_result: values.show_question_result,
        show_explanation: values.show_explanation,
        show_score_per_question: values.show_score_per_question,
        show_question_statistics: values.show_question_statistics,
        anti_cheat_enabled: values.anti_cheat_enabled,
        fullscreen_required: values.fullscreen_required,
        auto_submit_on_violation: values.auto_submit_on_violation,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save Quiz
      const updatedQuizzes = quizId ? allQuizzes.map(q => q.id === quizId ? newQuiz : q) : [newQuiz, ...allQuizzes];
      localStorage.setItem('quizzes', JSON.stringify(updatedQuizzes));

      // Save Questions & Options
      const questionsToSave = values.questions.map((q, idx) => {
        const qId = q.id || `q-mock-${id}-${idx}-${Date.now()}`;
        
        // Save options for this question
        const optionsToSave = q.options.map((o, oIdx) => ({
          id: o.id || `o-mock-${qId}-${oIdx}-${Date.now()}`,
          question_id: qId,
          option_text: o.option_text,
          is_correct: o.is_correct,
          match_text: o.match_text || null,
          created_at: new Date().toISOString()
        }));

        localStorage.setItem(`options_${qId}`, JSON.stringify(optionsToSave));

        return {
          id: qId,
          quiz_id: id,
          question_text: q.question_text,
          question_type: q.question_type || 'multiple_choice',
          media_type: q.media_type,
          media_url: q.media_url || null,
          points: q.points,
          explanation: q.explanation || null,
          order_index: idx,
          created_at: new Date().toISOString()
        };
      });

      localStorage.setItem(`questions_${id}`, JSON.stringify(questionsToSave));

      setSavedQuizId(id);
      setShowSuccessModal(true);
      return;
    }

    // Online Supabase Flow
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthorized');

      const id = quizId || crypto.randomUUID();
      const newQuiz = {
        id,
        teacher_id: user.id,
        title: values.title,
        description: values.description || null,
        opening_text: values.opening_text || null,
        closing_text: values.closing_text || null,
        pin_code: pin,
        duration_per_question: values.duration_per_question,
        random_questions: values.random_questions,
        random_options: values.random_options,
        thumbnail_url: values.thumbnail_url || null,
        quiz_mode: values.quiz_mode,
        lives_count: values.lives_count,
        show_final_result: values.show_final_result,
        show_leaderboard: values.show_leaderboard,
        show_correct_answer: values.show_correct_answer,
        show_answer_review: values.show_answer_review,
        show_question_result: values.show_question_result,
        show_explanation: values.show_explanation,
        show_score_per_question: values.show_score_per_question,
        show_question_statistics: values.show_question_statistics,
        anti_cheat_enabled: values.anti_cheat_enabled,
        fullscreen_required: values.fullscreen_required,
        auto_submit_on_violation: values.auto_submit_on_violation,
      };

      let quizUpsertError = null;
      if (quizId) {
        // Update quiz details
        const { error } = await supabase
          .from('quizzes')
          .update({
            title: values.title,
            description: values.description || null,
            opening_text: values.opening_text || null,
            closing_text: values.closing_text || null,
            duration_per_question: values.duration_per_question,
            random_questions: values.random_questions,
            random_options: values.random_options,
            thumbnail_url: values.thumbnail_url || null,
            quiz_mode: values.quiz_mode,
            lives_count: values.lives_count,
            show_final_result: values.show_final_result,
            show_leaderboard: values.show_leaderboard,
            show_correct_answer: values.show_correct_answer,
            show_answer_review: values.show_answer_review,
            show_question_result: values.show_question_result,
            show_explanation: values.show_explanation,
            show_score_per_question: values.show_score_per_question,
            show_question_statistics: values.show_question_statistics,
            anti_cheat_enabled: values.anti_cheat_enabled,
            fullscreen_required: values.fullscreen_required,
            auto_submit_on_violation: values.auto_submit_on_violation,
          })
          .eq('id', quizId);
        quizUpsertError = error;
      } else {
        // Insert new quiz details
        const { error } = await supabase
          .from('quizzes')
          .insert(newQuiz);
        quizUpsertError = error;
      }

      if (quizUpsertError) throw quizUpsertError;

      // Delete existing questions for updates to handle modifications
      if (quizId) {
        await supabase.from('questions').delete().eq('quiz_id', quizId);
      }

      // Add/Re-add questions and options
      for (let i = 0; i < values.questions.length; i++) {
        const q = values.questions[i];
        
        const { data: insertedQuestion, error: qErr } = await supabase
          .from('questions')
          .insert({
            quiz_id: id,
            question_text: q.question_text,
            question_type: q.question_type || 'multiple_choice',
            media_type: q.media_type,
            media_url: q.media_url || null,
            points: q.points,
            explanation: q.explanation || null,
            order_index: i
          })
          .select()
          .single();

        if (qErr) throw qErr;

        // Insert options
        const optionRows = q.options.map(o => ({
          question_id: insertedQuestion.id,
          option_text: o.option_text,
          is_correct: o.is_correct,
          match_text: o.match_text || null
        }));

        const { error: optErr } = await supabase
          .from('options')
          .insert(optionRows);

        if (optErr) throw optErr;
      }

      setMessage({ type: 'success', text: 'Kuis berhasil disimpan ke Cloud Supabase!' });
      setSavedQuizId(id);
      setShowSuccessModal(true);

    } catch (err: any) {
      console.error('Submit error:', err);
      setMessage({ type: 'error', text: err.message || 'Terjadi kesalahan saat menyimpan kuis.' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = () => {
    appendQuestion({
      question_text: '',
      media_type: 'text',
      media_url: '',
      points: 100,
      options: [
        { option_text: '', is_correct: true },
        { option_text: '', is_correct: false },
      ]
    });
    setActiveQuestionIndex(questionFields.length);
  };

  const handleDeleteQuestion = (index: number) => {
    if (questionFields.length <= 1) {
      showError('Peringatan', 'Kuis harus memiliki minimal 1 soal.');
      return;
    }
    removeQuestion(index);
    setActiveQuestionIndex(Math.max(0, index - 1));
  };

  const handleAddOption = (qIndex: number) => {
    const currentOptions = watchedQuestions[qIndex].options;
    if (currentOptions.length >= 4) {
      showError('Peringatan', 'Maksimal 4 pilihan jawaban.');
      return;
    }
    setValue(`questions.${qIndex}.options`, [
      ...currentOptions,
      { option_text: '', is_correct: false }
    ]);
  };

  const handleDeleteOption = (qIndex: number, optIndex: number) => {
    const currentOptions = watchedQuestions[qIndex].options;
    if (currentOptions.length <= 2) {
      showError('Peringatan', 'Minimal harus memiliki 2 pilihan jawaban.');
      return;
    }
    const updated = currentOptions.filter((_: any, idx: number) => idx !== optIndex);
    setValue(`questions.${qIndex}.options`, updated);
  };

  const toggleOptionCorrect = (qIndex: number, optIndex: number) => {
    const currentType = watchedQuestions[qIndex].question_type || 'multiple_choice';
    const currentOptions = watchedQuestions[qIndex].options;
    let updated;
    if (currentType === 'multiple_answer') {
      updated = currentOptions.map((o: any, idx: number) => ({
        ...o,
        is_correct: idx === optIndex ? !o.is_correct : o.is_correct
      }));
    } else {
      updated = currentOptions.map((o: any, idx: number) => ({
        ...o,
        is_correct: idx === optIndex ? !o.is_correct : false
      }));
    }
    setValue(`questions.${qIndex}.options`, updated);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-mesh">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Memuat editor kuis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-mesh">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header toolbar */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/teacher/dashboard')}
              className="p-2.5 rounded-xl border hover:bg-muted text-foreground transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground">
                {isNew ? 'Buat Kuis Baru' : 'Edit Kuis'}
              </h1>
              <p className="text-xs text-muted-foreground">Konstruksi soal, media pendukung, dan kunci jawaban</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground px-5 py-3 font-bold text-sm shadow hover:bg-primary/95 disabled:opacity-50 transition"
            >
              <Save className="h-4 w-4" />
              Simpan Kuis
            </button>
          </div>
        </div>

        {/* Message banner */}
        {message && (
          <div className={`p-4 rounded-2xl border text-sm font-semibold flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}>
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Main Quiz Metadata Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Detail Kuis</h2>
              
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Judul Kuis</label>
                <input
                  type="text"
                  {...register('title')}
                  placeholder="Kuis IPA Semester 1"
                  className="w-full mt-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                />
                 {errors.title && <p className="text-xs text-destructive mt-1 font-medium">{errors.title.message as any}</p>}
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Deskripsi</label>
                <textarea
                  {...register('description')}
                  placeholder="Tulis deskripsi kuis..."
                  rows={3}
                  className="w-full mt-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Timer (Detik)</label>
                  <input
                    type="number"
                    {...register('duration_per_question')}
                    className="w-full mt-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                   {errors.duration_per_question && <p className="text-xs text-destructive mt-1 font-medium">{errors.duration_per_question.message as any}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Thumbnail Kuis</label>
                  {uploadingType === 'thumbnail' ? (
                    <div className="w-full mt-1 flex flex-col items-center justify-center border rounded-xl py-2 px-3 text-[10px]">
                      <span className="font-bold text-primary mb-1">Mengunggah... {uploadProgress}%</span>
                      <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                        <div className="bg-primary h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <label className="w-full mt-1 flex items-center justify-center gap-1.5 border border-dashed rounded-xl cursor-pointer hover:bg-muted py-2.5 text-xs text-muted-foreground font-semibold">
                      <UploadCloud className="h-4 w-4" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleFileUpload(e, 'thumbnail')}
                        className="hidden"
                      />
                    </label>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">Maksimal ukuran file: 2 MB</p>
                </div>
              </div>

              {watch('thumbnail_url') && (
                <div className="rounded-xl overflow-hidden h-24 border">
                  <LazyImage src={watch('thumbnail_url')!} alt="Thumbnail preview" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input type="checkbox" {...register('random_questions')} className="rounded accent-primary h-4 w-4" />
                  Acak Urutan Soal
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input type="checkbox" {...register('random_options')} className="rounded accent-primary h-4 w-4" />
                  Acak Pilihan Jawaban
                </label>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Mode Kuis</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className={`flex flex-col p-3.5 rounded-2xl border cursor-pointer transition text-center items-center justify-center gap-1.5 select-none ${
                    watch('quiz_mode') === 'serius' 
                      ? 'border-primary bg-primary/5 text-primary' 
                      : 'border-border bg-background/50 hover:bg-muted text-muted-foreground'
                  }`}>
                    <input 
                      type="radio" 
                      value="serius" 
                      {...register('quiz_mode')} 
                      className="sr-only" 
                    />
                    <span className="text-xl">🔒</span>
                    <span className="text-xs font-black uppercase tracking-wide">Serius</span>
                    <span className="text-[9px] text-muted-foreground font-semibold leading-snug">Ujian formal, berurutan, no skip</span>
                  </label>
                  <label className={`flex flex-col p-3.5 rounded-2xl border cursor-pointer transition text-center items-center justify-center gap-1.5 select-none ${
                    watch('quiz_mode') === 'santai' 
                      ? 'border-amber-500 bg-amber-500/5 text-amber-500' 
                      : 'border-border bg-background/50 hover:bg-muted text-muted-foreground'
                  }`}>
                    <input 
                      type="radio" 
                      value="santai" 
                      {...register('quiz_mode')} 
                      className="sr-only" 
                    />
                    <span className="text-xl">🎮</span>
                    <span className="text-xs font-black uppercase tracking-wide">Santai</span>
                    <span className="text-[9px] text-muted-foreground font-semibold leading-snug">Sistem nyawa, skip & review</span>
                  </label>
                </div>
              </div>

              {watch('quiz_mode') === 'santai' && (
                <div className="glass-panel p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5 space-y-3">
                  <label className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-wider block">
                    ❤️ Pengaturan Nyawa (Lives)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setValue('lives_count', 3)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        watch('lives_count') > 0
                          ? 'border-amber-500 bg-amber-500/15 text-amber-600'
                          : 'border-border bg-background hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <span>❤️</span> Terbatas
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('lives_count', 0)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        watch('lives_count') === 0
                          ? 'border-amber-500 bg-amber-500/15 text-amber-600'
                          : 'border-border bg-background hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <span>∞</span> Tanpa Nyawa
                    </button>
                  </div>
                  {watch('lives_count') > 0 && (
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <span className="text-xs text-muted-foreground font-semibold">Jumlah Nyawa:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          {...register('lives_count', { valueAsNumber: true })}
                          className="w-16 rounded-lg border border-border bg-background px-2.5 py-1 text-center text-xs font-bold focus:border-amber-500 outline-none"
                        />
                        <span className="text-xs text-muted-foreground font-medium">kesempatan</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Teks Pembuka (Opening)</label>
                <textarea
                  {...register('opening_text')}
                  placeholder="Teks pembuka saat kuis dimulai..."
                  rows={2}
                  className="w-full mt-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Teks Penutup (Closing)</label>
                <textarea
                  {...register('closing_text')}
                  placeholder="Teks penutup saat kuis berakhir..."
                  rows={2}
                  className="w-full mt-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            {/* Settings & Review Panel */}
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <button
                type="button"
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                className="w-full flex items-center justify-between text-xs font-black text-foreground uppercase tracking-wider outline-none"
              >
                <span>⚙️ Hasil & Review</span>
                <span className="text-[10px] transition-transform duration-200" style={{ transform: showSettingsPanel ? 'rotate(90deg)' : 'none' }}>▶</span>
              </button>

              {showSettingsPanel && (
                <div className="space-y-4 pt-2 border-t border-border divide-y divide-border/50">
                  <div className="space-y-2 pb-3">
                    <h3 className="text-[9px] font-black uppercase text-primary tracking-wider mb-1">Hasil Akhir Kuis</h3>
                    <ToggleSwitch
                      label="Tampilkan Hasil Akhir"
                      description="Tampilkan total skor akhir siswa saat kuis selesai."
                      name="show_final_result"
                      register={register}
                    />
                    <ToggleSwitch
                      label="Tampilkan Leaderboard"
                      description="Tampilkan daftar peringkat & podium peserta."
                      name="show_leaderboard"
                      register={register}
                      disabled={!watch('show_final_result')}
                    />
                    <ToggleSwitch
                      label="Review Jawaban"
                      description="Tampilkan daftar review lembar jawaban siswa."
                      name="show_answer_review"
                      register={register}
                    />
                  </div>

                  <div className="space-y-2 pt-3">
                    <h3 className="text-[9px] font-black uppercase text-amber-500 tracking-wider mb-1">Tinjauan per Soal</h3>
                    <ToggleSwitch
                      label="Hasil Langsung"
                      description="Tampilkan popup feedback setelah soal disubmit."
                      name="show_question_result"
                      register={register}
                    />
                    <ToggleSwitch
                      label="Jawaban Benar/Salah"
                      description="Highlight opsi jawaban benar/salah secara langsung."
                      name="show_correct_answer"
                      register={register}
                      disabled={!watch('show_question_result')}
                    />
                    <ToggleSwitch
                      label="Skor per Soal"
                      description="Tampilkan perolehan poin/skor di popup feedback."
                      name="show_score_per_question"
                      register={register}
                    />
                    <ToggleSwitch
                      label="Statistik Jawaban"
                      description="Tampilkan diagram persentase pilihan jawaban kelas."
                      name="show_question_statistics"
                      register={register}
                    />
                    <ToggleSwitch
                      label="Pembahasan Soal"
                      description="Tampilkan penjelasan pembahasan jawaban soal."
                      name="show_explanation"
                      register={register}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Anti-Cheat Settings Panel */}
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                🛡️ Mode Anti-Cheat
              </h3>
              
              <div className="space-y-4 pt-2 border-t border-border">
                <ToggleSwitch
                  label="Aktifkan Anti-Cheat"
                  description="Batasi tab-switching, klik kanan, copy-paste, dan inspect element."
                  name="anti_cheat_enabled"
                  register={register}
                />
                
                <ToggleSwitch
                  label="Wajib Fullscreen"
                  description="Murid harus berada dalam mode layar penuh selama kuis berlangsung."
                  name="fullscreen_required"
                  register={register}
                  disabled={!watch('anti_cheat_enabled')}
                />

                <div className={`space-y-1.5 transition ${!watch('anti_cheat_enabled') ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">
                    Maksimal Pelanggaran Toleransi
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={!watch('anti_cheat_enabled')}
                    {...register('auto_submit_on_violation')}
                    className="w-full rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:bg-background transition"
                  />
                  <span className="text-[9px] text-muted-foreground block leading-relaxed font-semibold">
                    Kuis akan otomatis dikirim apabila murid melanggar ketentuan melebihi batas ini.
                  </span>
                </div>
              </div>
            </div>

            {/* Question Selector List */}
            <div className="glass-panel p-6 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Daftar Soal</h3>
                <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                  {questionFields.length} Soal
                </span>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {questionFields.map((field, idx) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => setActiveQuestionIndex(idx)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left text-xs font-semibold transition ${
                      activeQuestionIndex === idx
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background/25 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate pr-2">
                      {idx + 1}. {watchedQuestions?.[idx]?.question_text || '(Pertanyaan Kosong)'}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddQuestion}
                className="w-full flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/40 text-primary py-2.5 text-xs font-bold hover:bg-primary/5 transition"
              >
                <Plus className="h-4 w-4" />
                Tambah Soal
              </button>
            </div>
          </div>

          {/* Question Editor Details Panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-panel p-8 rounded-3xl shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-lg font-bold text-foreground">Sunting Soal #{activeQuestionIndex + 1}</h3>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(activeQuestionIndex)}
                  className="flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 rounded-xl px-3 py-1.5 font-bold transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Soal
                </button>
              </div>

              {/* Question Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">Tipe Soal</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { type: 'multiple_choice', label: 'Pilihan Ganda' },
                      { type: 'true_false', label: 'Benar / Salah' },
                      { type: 'multiple_answer', label: 'Banyak Jawaban' },
                      { type: 'matching', label: 'Pencocokan' }
                    ].map(item => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          const currentType = currentWatchedQuestion?.question_type;
                          if (currentType === item.type) return;

                          setValue(`questions.${activeQuestionIndex}.question_type`, item.type);

                          // Populate options automatically based on type
                          if (item.type === 'true_false') {
                            setValue(`questions.${activeQuestionIndex}.options`, [
                              { option_text: 'Benar', is_correct: true, match_text: '' },
                              { option_text: 'Salah', is_correct: false, match_text: '' }
                            ]);
                          } else if (item.type === 'matching') {
                            setValue(`questions.${activeQuestionIndex}.options`, [
                              { option_text: 'Item A', is_correct: true, match_text: 'Pasangan 1' },
                              { option_text: 'Item B', is_correct: true, match_text: 'Pasangan 2' }
                            ]);
                          } else {
                            setValue(`questions.${activeQuestionIndex}.options`, [
                              { option_text: '', is_correct: true, match_text: '' },
                              { option_text: '', is_correct: false, match_text: '' }
                            ]);
                          }
                        }}
                        className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition text-center ${
                          (currentWatchedQuestion?.question_type || 'multiple_choice') === item.type
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Teks Pertanyaan</label>
                  <textarea
                    {...register(`questions.${activeQuestionIndex}.question_text`)}
                    placeholder="Contoh: Berapakah hasil perkalian berikut..."
                    rows={3}
                    className="w-full mt-1 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
                  />
                  {(errors.questions as any)?.[activeQuestionIndex]?.question_text && (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      {(errors.questions as any)[activeQuestionIndex]?.question_text?.message}
                    </p>
                  )}
                </div>

                {/* Media Type Selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Tipe Soal / Media</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (currentWatchedQuestion?.media_type !== 'text') {
                            setValue(`questions.${activeQuestionIndex}.media_type`, 'text');
                            setValue(`questions.${activeQuestionIndex}.media_url`, '');
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-[10px] font-bold transition ${
                          currentWatchedQuestion?.media_type === 'text'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Type className="h-4 w-4 mb-1" />
                        Teks
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentWatchedQuestion?.media_type !== 'image') {
                            setValue(`questions.${activeQuestionIndex}.media_type`, 'image');
                            setValue(`questions.${activeQuestionIndex}.media_url`, '');
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-[10px] font-bold transition ${
                          currentWatchedQuestion?.media_type === 'image'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Image className="h-4 w-4 mb-1" />
                        Gambar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentWatchedQuestion?.media_type !== 'audio') {
                            setValue(`questions.${activeQuestionIndex}.media_type`, 'audio');
                            setValue(`questions.${activeQuestionIndex}.media_url`, '');
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-[10px] font-bold transition ${
                          currentWatchedQuestion?.media_type === 'audio'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Volume2 className="h-4 w-4 mb-1" />
                        Audio
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentWatchedQuestion?.media_type !== 'video') {
                            setValue(`questions.${activeQuestionIndex}.media_type`, 'video');
                            setValue(`questions.${activeQuestionIndex}.media_url`, '');
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-[10px] font-bold transition ${
                          currentWatchedQuestion?.media_type === 'video'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Video className="h-4 w-4 mb-1" />
                        Video
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentWatchedQuestion?.media_type !== 'latex') {
                            setValue(`questions.${activeQuestionIndex}.media_type`, 'latex');
                            setValue(`questions.${activeQuestionIndex}.media_url`, '');
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-[10px] font-bold transition ${
                          currentWatchedQuestion?.media_type === 'latex'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background/30 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Sigma className="h-4 w-4 mb-1" />
                        Math
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Bobot Poin Soal</label>
                    <input
                      type="number"
                      min={10}
                      max={10000}
                      {...register(`questions.${activeQuestionIndex}.points`)}
                      className="w-full rounded-2xl border border-border bg-background/50 px-3.5 py-3 text-sm outline-none focus:border-primary font-semibold"
                      placeholder="Contoh: 100"
                    />
                    {/* Presets badges */}
                    <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                      {[100, 200, 500, 1000].map(pVal => (
                        <button
                          key={pVal}
                          type="button"
                          onClick={() => setValue(`questions.${activeQuestionIndex}.points`, pVal)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                            Number(currentWatchedQuestion?.points) === pVal
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {pVal} Poin
                        </button>
                      ))}
                    </div>
                    {(errors.questions as any)?.[activeQuestionIndex]?.points && (
                      <p className="text-xs text-destructive mt-1 font-medium">
                        {(errors.questions as any)[activeQuestionIndex]?.points?.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Media Input depending on media_type */}
                {currentWatchedQuestion?.media_type === 'latex' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-2xl bg-muted/20">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Formula LaTeX</label>
                      <input
                        type="text"
                        {...register(`questions.${activeQuestionIndex}.media_url`)}
                        placeholder="Contoh: E = mc^2 atau x = \frac{-b \pm \sqrt{d}}{2a}"
                        className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <div className="flex flex-col justify-center border-l pl-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Preview Formula Matematika</span>
                      <div className="mt-2 text-sm text-foreground bg-background rounded-xl p-2 min-h-[36px] flex items-center justify-center border">
                        {currentWatchedQuestion?.media_url ? (
                          <LatexRenderer tex={currentWatchedQuestion.media_url} displayMode />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Formula matematika kosong</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {currentWatchedQuestion?.media_type === 'image' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-2xl bg-muted/20">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">File Gambar / URL</label>
                      <input
                        type="text"
                        {...register(`questions.${activeQuestionIndex}.media_url`)}
                        placeholder="https://link-gambar.com/soal.jpg"
                        className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary mb-2"
                      />
                      {uploadingType === `media-${activeQuestionIndex}` ? (
                        <div className="w-full flex flex-col items-center justify-center border rounded-xl py-2 px-3 text-[10px] bg-background">
                          <span className="font-bold text-primary mb-1">Mengunggah Gambar... {uploadProgress}%</span>
                          <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <label className="w-full flex items-center justify-center gap-1.5 border border-dashed rounded-xl cursor-pointer hover:bg-muted py-2 text-xs text-muted-foreground font-semibold">
                          <UploadCloud className="h-4 w-4" />
                          Unggah File Gambar
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleFileUpload(e, 'media', activeQuestionIndex)}
                            className="hidden"
                          />
                        </label>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">Maksimal ukuran file: 2 MB</p>
                    </div>
                    <div className="flex items-center justify-center border-l pl-4">
                      {currentWatchedQuestion?.media_url ? (
                        <LazyImage
                          src={currentWatchedQuestion.media_url}
                          alt="Soal preview"
                          className="h-28 max-w-full object-contain rounded-xl border bg-background"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Gambar belum diupload</span>
                      )}
                    </div>
                  </div>
                )}

                {currentWatchedQuestion?.media_type === 'audio' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-2xl bg-muted/20">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">File Audio / URL</label>
                      <input
                        type="text"
                        {...register(`questions.${activeQuestionIndex}.media_url`)}
                        placeholder="https://link-audio.com/lagu.mp3"
                        className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary mb-2"
                      />
                      {uploadingType === `media-${activeQuestionIndex}` ? (
                        <div className="w-full flex flex-col items-center justify-center border rounded-xl py-2 px-3 text-[10px] bg-background">
                          <span className="font-bold text-primary mb-1">Mengunggah Audio... {uploadProgress}%</span>
                          <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <label className="w-full flex items-center justify-center gap-1.5 border border-dashed rounded-xl cursor-pointer hover:bg-muted py-2 text-xs text-muted-foreground font-semibold">
                          <UploadCloud className="h-4 w-4" />
                          Unggah File Audio
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={e => handleFileUpload(e, 'media', activeQuestionIndex)}
                            className="hidden"
                          />
                        </label>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">Maksimal ukuran file: 10 MB</p>
                    </div>
                    <div className="flex flex-col justify-center border-l pl-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Pemutar Audio</span>
                      {currentWatchedQuestion?.media_url ? (
                        <audio controls src={getSafeMediaUrl(currentWatchedQuestion.media_url)} className="mt-2 w-full max-h-10" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic mt-2">Audio belum diupload</span>
                      )}
                    </div>
                  </div>
                )}

                {currentWatchedQuestion?.media_type === 'video' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-2xl bg-muted/20">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">File Video / URL</label>
                      <input
                        type="text"
                        {...register(`questions.${activeQuestionIndex}.media_url`)}
                        placeholder="https://link-video.com/soal.mp4"
                        className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary mb-2"
                      />
                      {uploadingType === `media-${activeQuestionIndex}` ? (
                        <div className="w-full flex flex-col items-center justify-center border rounded-xl py-2 px-3 text-[10px] bg-background">
                          <span className="font-bold text-primary mb-1">Mengunggah Video... {uploadProgress}%</span>
                          <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <label className="w-full flex items-center justify-center gap-1.5 border border-dashed rounded-xl cursor-pointer hover:bg-muted py-2 text-xs text-muted-foreground font-semibold">
                          <UploadCloud className="h-4 w-4" />
                          Unggah File Video
                          <input
                            type="file"
                            accept="video/*"
                            onChange={e => handleFileUpload(e, 'media', activeQuestionIndex)}
                            className="hidden"
                          />
                        </label>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">Maksimal ukuran file: 50 MB</p>
                    </div>
                    <div className="flex flex-col justify-center border-l pl-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Pemutar Video</span>
                      {currentWatchedQuestion?.media_url ? (
                        <video controls src={getSafeMediaUrl(currentWatchedQuestion.media_url)} className="mt-2 w-full max-h-32 rounded-xl border bg-background" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic mt-2">Video belum diupload</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Option editor boxes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">
                      {currentWatchedQuestion?.question_type === 'matching' ? 'Pasangan Pencocokan' : 'Pilihan Jawaban'}
                    </label>
                    {currentWatchedQuestion?.question_type !== 'true_false' && (
                      <button
                        type="button"
                        onClick={() => handleAddOption(activeQuestionIndex)}
                        className="text-xs text-primary font-bold hover:underline"
                      >
                        + Tambah Opsi
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentWatchedQuestion?.options?.map((option: any, optIdx: number) => {
                      const colors = [
                        'border-red-500 focus-within:ring-red-500/20 bg-red-50/10',
                        'border-blue-500 focus-within:ring-blue-500/20 bg-blue-50/10',
                        'border-yellow-500 focus-within:ring-yellow-500/20 bg-yellow-50/10',
                        'border-green-500 focus-within:ring-green-500/20 bg-green-50/10',
                      ];

                      const isMatching = currentWatchedQuestion?.question_type === 'matching';
                      const isTrueFalse = currentWatchedQuestion?.question_type === 'true_false';

                      return (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-3 border-2 rounded-2xl p-3 transition focus-within:ring-4 ${colors[optIdx % colors.length]}`}
                        >
                          {!isMatching && (
                            <input
                              type={currentWatchedQuestion?.question_type === 'multiple_answer' ? 'checkbox' : 'radio'}
                              name={`correct-option-${activeQuestionIndex}`}
                              checked={option.is_correct}
                              onChange={() => toggleOptionCorrect(activeQuestionIndex, optIdx)}
                              className="h-5 w-5 rounded accent-green-600 shrink-0 cursor-pointer"
                              title="Tandai Benar"
                            />
                          )}
                          
                          {isMatching ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder={`Item Kiri ${optIdx + 1}`}
                                {...register(`questions.${activeQuestionIndex}.options.${optIdx}.option_text`)}
                                className="w-1/2 bg-background/50 rounded-xl px-3 py-2 text-xs font-semibold outline-none border border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                              />
                              <span className="text-muted-foreground text-xs font-bold">🔗</span>
                              <input
                                type="text"
                                placeholder={`Pasangan Kanan ${optIdx + 1}`}
                                {...register(`questions.${activeQuestionIndex}.options.${optIdx}.match_text`)}
                                className="w-1/2 bg-background/50 rounded-xl px-3 py-2 text-xs font-semibold outline-none border border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                              />
                            </div>
                          ) : (
                            <input
                              type="text"
                              disabled={isTrueFalse}
                              placeholder={`Jawaban Pilihan ${String.fromCharCode(65 + optIdx)}`}
                              {...register(`questions.${activeQuestionIndex}.options.${optIdx}.option_text`)}
                              className="w-full bg-transparent text-sm font-semibold outline-none border-none text-foreground placeholder:text-muted-foreground disabled:opacity-85"
                            />
                          )}

                          {!isTrueFalse && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOption(activeQuestionIndex, optIdx)}
                              className="p-1 text-muted-foreground hover:text-destructive transition animate-fade-in shrink-0"
                              title="Hapus Opsi"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation Input */}
                <div className="pt-4 border-t border-border mt-4">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Pembahasan Soal (Penjelasan Jawaban)</label>
                  <textarea
                    {...register(`questions.${activeQuestionIndex}.explanation`)}
                    placeholder="Masukkan pembahasan soal atau alasan mengapa pilihan jawaban di atas benar. Pembahasan akan ditampilkan kepada murid saat mereka melihat hasil/review soal..."
                    rows={3}
                    className="w-full mt-1.5 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm outline-none focus:border-primary resize-none text-foreground placeholder:text-muted-foreground"
                  />
                </div>

              </div>
            </div>
          </div>

        </form>
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-panel p-8 rounded-3xl w-full max-w-md text-center space-y-6 shadow-2xl border border-white/20 transform scale-100 transition-all duration-300">
            <div className="h-16 w-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
              <CheckCircle2 className="h-10 w-10 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-foreground">Kuis Berhasil Disimpan!</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Kuis Anda telah berhasil disimpan. Anda dapat langsung memainkannya bersama siswa atau kembali ke dashboard.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="flex-1 rounded-2xl border border-border bg-background hover:bg-muted text-foreground py-3.5 font-bold text-sm transition"
              >
                Kembali ke Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate(`/teacher/host-session?id=${savedQuizId}`)}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-green-600 hover:bg-green-700 text-white py-3.5 font-bold text-sm transition shadow-lg shadow-green-600/20"
              >
                <Play className="h-4 w-4 fill-white" />
                Mainkan Kuis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
