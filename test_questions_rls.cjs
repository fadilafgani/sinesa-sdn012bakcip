const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Testing anonymous database access to quizzes, questions, options, and participants...');

  // Test 1: Read quizzes anonymously
  const { data: quizzes, error: quizErr } = await supabase
    .from('quizzes')
    .select('id, title, pin_code')
    .limit(1);
  console.log('1. Quizzes read:', quizErr ? `ERROR: ${quizErr.message}` : `Success (${quizzes.length} rows)`);

  // Test 2: Read questions anonymously
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, question_text')
    .limit(1);
  console.log('2. Questions read:', qErr ? `ERROR: ${qErr.message}` : `Success (${questions.length} rows)`);

  // Test 3: Read options anonymously
  const { data: options, error: optErr } = await supabase
    .from('options')
    .select('id, option_text')
    .limit(1);
  console.log('3. Options read:', optErr ? `ERROR: ${optErr.message}` : `Success (${options.length} rows)`);

  // Test 4: Read participants anonymously
  const { data: participants, error: partErr } = await supabase
    .from('participants')
    .select('id, display_name')
    .limit(1);
  console.log('4. Participants read:', partErr ? `ERROR: ${partErr.message}` : `Success (${participants.length} rows)`);
  
  // Test 5: Read quiz_sessions anonymously
  const { data: sessions, error: sessErr } = await supabase
    .from('quiz_sessions')
    .select('id, status')
    .limit(1);
  console.log('5. Quiz Sessions read:', sessErr ? `ERROR: ${sessErr.message}` : `Success (${sessions.length} rows)`);
}

run();
