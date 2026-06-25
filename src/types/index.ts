export type UserRole = 'admin' | 'teacher' | 'student';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  username?: string | null;
  status?: 'active' | 'inactive';
  email?: string | null;
}

export type QuizMode = 'serius' | 'santai';

export interface Quiz {
  id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  opening_text: string | null;
  closing_text: string | null;
  pin_code: string;
  duration_per_question: number;
  random_questions: boolean;
  random_options: boolean;
  thumbnail_url: string | null;
  quiz_mode: QuizMode;
  lives_count: number;
  show_final_result: boolean;
  show_leaderboard: boolean;
  show_correct_answer: boolean;
  show_answer_review: boolean;
  show_question_result: boolean;
  show_explanation: boolean;
  show_score_per_question: boolean;
  show_question_statistics: boolean;
  anti_cheat_enabled: boolean;
  fullscreen_required: boolean;
  auto_submit_on_violation: number;
  created_at: string;
  updated_at: string;
  status?: 'active' | 'inactive';
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'multiple_answer' | 'matching';

export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type?: QuestionType;
  media_type: 'text' | 'image' | 'audio' | 'video' | 'latex';
  media_url: string | null;
  points: number;
  order_index: number;
  explanation?: string | null;
  created_at: string;
  options?: Option[];
}

export interface Option {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  match_text?: string | null;
  created_at: string;
}

export interface QuizSession {
  id: string;
  quiz_id: string;
  host_id: string;
  status: 'lobby' | 'active' | 'completed';
  current_question_index: number;
  question_started_at: string | null;
  question_expires_at: string | null;
  quiz_mode: QuizMode;
  lives_count: number;
  show_final_result: boolean;
  show_leaderboard: boolean;
  show_correct_answer: boolean;
  show_answer_review: boolean;
  show_question_result: boolean;
  show_explanation: boolean;
  show_score_per_question: boolean;
  show_question_statistics: boolean;
  anti_cheat_enabled: boolean;
  fullscreen_required: boolean;
  auto_submit_on_violation: number;
  created_at: string;
  completed_at: string | null;
  quiz?: Quiz;
}

export interface Participant {
  id: string;
  session_id: string;
  student_id: string | null;
  display_name: string;
  score: number;
  lives: number;
  skipped_questions: string[];
  question_status: Record<string, 'unanswered' | 'answered' | 'skipped'>;
  current_progress: number;
  violation_count: number;
  is_completed?: boolean;
  joined_at: string;
}

export interface Answer {
  id: string;
  participant_id: string;
  question_id: string;
  selected_option_id: string | null;
  selected_option_ids?: string[] | null;
  matching_answers?: Record<string, string> | null;
  is_correct: boolean;
  response_time_ms: number;
  score_awarded: number;
  answered_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
  profile?: Profile;
}

export interface SystemSetting {
  key: string;
  value: string;
  updated_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  login_at: string;
  last_activity_at: string;
  is_online: boolean;
  ip_address: string | null;
  user_agent: string | null;
  profile?: Profile;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
}
