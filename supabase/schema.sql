-- SINESA Database SQL Schema
-- Platform Kuis Realtime Berbasis Gamifikasi

-- 1. ENUM DEFINITIONS
CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student');

-- 2. PROFILES TABLE
-- Handles additional user metadata, linked to Supabase Auth auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role user_role NOT NULL DEFAULT 'student',
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. QUIZZES TABLE
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    pin_code VARCHAR(6) UNIQUE NOT NULL,
    duration_per_question INTEGER DEFAULT 30 NOT NULL, -- in seconds
    random_questions BOOLEAN DEFAULT FALSE NOT NULL,
    random_options BOOLEAN DEFAULT FALSE NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for quizzes
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

-- 4. QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
    question_text TEXT NOT NULL,
    media_type VARCHAR(10) CHECK (media_type IN ('text', 'image', 'audio', 'latex')) DEFAULT 'text' NOT NULL,
    media_url TEXT,
    points INTEGER DEFAULT 100 NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 5. OPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.options (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for options
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;

-- 6. QUIZ SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
    host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('lobby', 'active', 'completed')) DEFAULT 'lobby' NOT NULL,
    current_stage VARCHAR(30) DEFAULT 'waiting' NOT NULL,
    current_question_index INTEGER DEFAULT -1 NOT NULL,
    question_started_at TIMESTAMP WITH TIME ZONE,
    question_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS for quiz_sessions
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

-- 7. PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.quiz_sessions(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    score INTEGER DEFAULT 0 NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (session_id, display_name)
);

-- Enable RLS for participants
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- 8. ANSWERS TABLE
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
    selected_option_id UUID REFERENCES public.options(id) ON DELETE CASCADE NOT NULL,
    is_correct BOOLEAN NOT NULL,
    response_time_ms INTEGER NOT NULL,
    score_awarded INTEGER NOT NULL,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (participant_id, question_id)
);

-- Enable RLS for answers
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- 9. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- TRIGGER: Automatically create user profile in public.profiles on auth signup
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, avatar_url)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'student'::public.user_role),
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Profiles Policies
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can do everything on profiles"
ON public.profiles FOR ALL
TO authenticated
USING (
  ((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'
);

-- Quizzes Policies
CREATE POLICY "Quizzes are viewable by authenticated users"
ON public.quizzes FOR SELECT
TO authenticated
USING (true);

-- Anyone can select quizzes if they are joining a session (allow anon for playing)
CREATE POLICY "Quizzes are viewable by anon for sessions"
ON public.quizzes FOR SELECT
TO anon
USING (true);

CREATE POLICY "Teachers can insert their own quizzes"
ON public.quizzes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  )
);

CREATE POLICY "Teachers can update/delete their own quizzes"
ON public.quizzes FOR UPDATE
TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete their own quizzes"
ON public.quizzes FOR DELETE
TO authenticated
USING (auth.uid() = teacher_id);

-- Questions Policies
CREATE POLICY "Questions are viewable by anyone"
ON public.questions FOR SELECT
USING (true);

CREATE POLICY "Teachers can manage questions of their own quizzes"
ON public.questions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quizzes
    WHERE id = questions.quiz_id AND teacher_id = auth.uid()
  )
);

-- Options Policies
CREATE POLICY "Options are viewable by anyone"
ON public.options FOR SELECT
USING (true);

CREATE POLICY "Teachers can manage options of their own quizzes"
ON public.options FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.quizzes quiz ON q.quiz_id = quiz.id
    WHERE q.id = options.question_id AND quiz.teacher_id = auth.uid()
  )
);

-- Quiz Sessions Policies
CREATE POLICY "Sessions are viewable by anyone"
ON public.quiz_sessions FOR SELECT
USING (true);

CREATE POLICY "Teachers can manage sessions"
ON public.quiz_sessions FOR ALL
TO authenticated
USING (
  host_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  )
);

-- Participants Policies
CREATE POLICY "Participants are viewable by anyone"
ON public.participants FOR SELECT
USING (true);

CREATE POLICY "Anyone can join a session as participant"
ON public.participants FOR INSERT
WITH CHECK (true);

CREATE POLICY "Participants can update their own record"
ON public.participants FOR UPDATE
USING (true);

-- Answers Policies
CREATE POLICY "Answers are viewable by session host or student participant"
ON public.answers FOR SELECT
USING (true);

CREATE POLICY "Participants can insert answers"
ON public.answers FOR INSERT
WITH CHECK (true);

-- Activity Logs Policies
CREATE POLICY "Activity logs readable by admin"
ON public.activity_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Anyone can insert activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (true);


-- =========================================================================
-- SUPABASE REALTIME REPLICATION ENABLEMENT
-- =========================================================================
-- Enable Postgres Changes in Supabase Realtime for the live gameplay tables
DO $$
BEGIN
  -- Add public.quiz_sessions if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'quiz_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_sessions;
  END IF;

  -- Add public.participants if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
  END IF;

  -- Add public.answers if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'answers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;
  END IF;
END;
$$;

