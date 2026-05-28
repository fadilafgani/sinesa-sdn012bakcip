import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = 'c:/laragon/www/evaluasi-bakcip/.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('*, quizzes(title)')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('--- RECENT SESSIONS ---');
  console.log(JSON.stringify(sessions, null, 2));

  if (sessions && sessions.length > 0) {
    const { data: participants } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessions[0].id);
    console.log('\n--- PARTICIPANTS OF LATEST SESSION ---');
    console.log(JSON.stringify(participants, null, 2));
    
    const { data: questions } = await supabase
      .from('questions')
      .select('id, order_index')
      .eq('quiz_id', sessions[0].quiz_id);
    console.log('\n--- QUESTIONS OF LATEST SESSION QUIZ ---');
    console.log(JSON.stringify(questions, null, 2));

    if (questions && questions.length > 0) {
      const { data: options, error } = await supabase
        .from('options')
        .select('*')
        .eq('question_id', questions[0].id);
      console.log('\n--- OPTIONS OF FIRST QUESTION ---');
      console.log(JSON.stringify(options, null, 2));
      if (error) console.error('Error fetching options:', error);
    }
  }
}

check();
