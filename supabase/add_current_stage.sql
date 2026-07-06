-- Migration: Add current_stage column to quiz_sessions
ALTER TABLE public.quiz_sessions ADD COLUMN IF NOT EXISTS current_stage VARCHAR(30) DEFAULT 'waiting' NOT NULL;
