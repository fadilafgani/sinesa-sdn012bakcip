import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file from project root
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Supabase environment variables not found in .env');
  process.exit(1);
}

console.log('Using Supabase Url:', supabaseUrl);
console.log('Supabase Anon Key:', supabaseAnonKey.substring(0, 12) + '...');

const mainSupabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to run clean ups
async function cleanup(testQuizId, sessionId, participantIds) {
  console.log('Cleaning up simulated data...');
  try {
    if (participantIds && participantIds.length > 0) {
      await mainSupabase.from('participants').delete().in('id', participantIds);
    }
    if (sessionId) {
      await mainSupabase.from('quiz_sessions').delete().eq('id', sessionId);
    }
    if (testQuizId) {
      await mainSupabase.from('quizzes').delete().eq('id', testQuizId);
    }
    console.log('Cleanup finished.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

async function simulateLoad(userCount, teacherId) {
  console.log(`\n==================================================`);
  console.log(`STARTING SIMULATION FOR ${userCount} CONCURRENT USERS`);
  console.log(`==================================================`);

  // Create a dedicated test quiz
  const testPin = Math.floor(100000 + Math.random() * 900000).toString();
  const { data: testQuiz, error: createQErr } = await mainSupabase.from('quizzes').insert({
    teacher_id: teacherId,
    title: `Load Test Quiz ${Date.now()}`,
    description: 'Temporary quiz for concurrent load testing',
    pin_code: testPin,
    duration_per_question: 30,
    random_questions: false,
    random_options: false
  }).select().single();

  if (createQErr || !testQuiz) {
    console.error('Failed to create temporary quiz for test.', createQErr);
    return null;
  }
  console.log(`Created temp quiz with PIN: ${testPin} (ID: ${testQuiz.id})`);

  // Create a question for the temp quiz
  const { data: testQuestion, error: createQuestErr } = await mainSupabase.from('questions').insert({
    quiz_id: testQuiz.id,
    question_text: 'What is 1 + 1?',
    media_type: 'text',
    points: 100,
    order_index: 0
  }).select().single();

  if (createQuestErr || !testQuestion) {
    console.error('Failed to create temporary question.', createQuestErr);
    await cleanup(testQuiz.id, null, []);
    return null;
  }
  console.log(`Created temp question: "${testQuestion.question_text}" (ID: ${testQuestion.id})`);

  // Create options for the question
  const { data: testOptions, error: createOptErr } = await mainSupabase.from('options').insert([
    { question_id: testQuestion.id, option_text: '1', is_correct: false },
    { question_id: testQuestion.id, option_text: '2', is_correct: true },
    { question_id: testQuestion.id, option_text: '3', is_correct: false }
  ]).select();

  if (createOptErr || !testOptions || testOptions.length === 0) {
    console.error('Failed to create options for temporary question.', createOptErr);
    await cleanup(testQuiz.id, null, []);
    return null;
  }
  const correctOptionId = testOptions.find(o => o.is_correct).id;

  // 2. Create a test session
  const { data: session, error: sErr } = await mainSupabase.from('quiz_sessions').insert({
    quiz_id: testQuiz.id,
    host_id: teacherId,
    status: 'lobby',
    current_stage: 'waiting',
    current_question_index: -1
  }).select().single();

  if (sErr || !session) {
    console.error('Failed to create quiz session for test.', sErr);
    await cleanup(testQuiz.id, null, []);
    return null;
  }
  console.log(`Created Quiz Session: (ID: ${session.id})`);

  const participantIds = [];
  const joinTimes = [];
  const submitTimes = [];

  // Scenario 1: Join Quiz simultaneously
  console.log(`\nScenario 1: Simulating ${userCount} users joining simultaneously...`);
  const joinPromises = [];
  const startJoinTime = performance.now();

  for (let i = 0; i < userCount; i++) {
    const studentName = `Simulated Student ${i}_${Date.now()}`;
    const pPromise = (async () => {
      const pStart = performance.now();
      // Join as anon user since students join anonymously via PIN
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await anonClient.from('participants').insert({
        session_id: session.id,
        display_name: studentName,
        score: 0,
        joined_at: new Date().toISOString()
      }).select().single();

      const pDuration = performance.now() - pStart;
      if (error) {
        console.error(`- Student ${i} failed to join:`, error.message);
        return null;
      }
      joinTimes.push(pDuration);
      return data;
    })();
    joinPromises.push(pPromise);
  }

  const joinResults = await Promise.all(joinPromises);
  const totalJoinDuration = performance.now() - startJoinTime;
  const activeParticipants = joinResults.filter(p => p !== null);
  activeParticipants.forEach(p => participantIds.push(p.id));

  console.log(`Join Results:`);
  console.log(`- Success: ${activeParticipants.length}/${userCount}`);
  console.log(`- Total Duration: ${totalJoinDuration.toFixed(1)}ms`);
  if (joinTimes.length > 0) {
    joinTimes.sort((a, b) => a - b);
    const avgJoin = joinTimes.reduce((sum, val) => sum + val, 0) / joinTimes.length;
    const p50 = joinTimes[Math.floor(joinTimes.length * 0.5)];
    const p95 = joinTimes[Math.floor(joinTimes.length * 0.95)];
    console.log(`- Join Latency: Avg ${avgJoin.toFixed(1)}ms | p50 ${p50.toFixed(1)}ms | p95 ${p95.toFixed(1)}ms`);
  }

  // Scenario 2: Teacher goes to Next Question (Simulate Realtime updates)
  console.log(`\nScenario 2: Realtime Stage/Question broadcast simulation...`);
  const realtimeClients = [];
  const receivedEventsTimes = [];
  let eventsCount = 0;

  // Set up realtime subscriptions for a sample subset to measure event latency
  const sampleSize = Math.min(10, userCount);
  console.log(`Setting up realtime listeners for ${sampleSize} sample clients...`);
  
  for (let i = 0; i < sampleSize; i++) {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const channel = client.channel(`test-realtime-sub-${i}`);
    
    const subPromise = new Promise((resolve) => {
      channel.on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'quiz_sessions',
        filter: `id=eq.${session.id}`
      }, (payload) => {
        const receivedAt = performance.now();
        receivedEventsTimes.push({ index: i, receivedAt });
        eventsCount++;
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          resolve(true);
        }
      });
    });
    
    realtimeClients.push({ client, channel, subPromise });
  }

  // Wait for subscriptions to connect
  await Promise.all(realtimeClients.map(rc => rc.subPromise));
  console.log(`Realtime channels active. Host changing stage to 'countdown'...`);

  const broadcastStartTime = performance.now();
  await mainSupabase.from('quiz_sessions').update({
    current_stage: 'countdown',
    current_question_index: 0,
    question_started_at: new Date().toISOString()
  }).eq('id', session.id);

  // Wait 1.5 seconds for realtime events to distribute
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log(`Realtime Event Latency Results:`);
  console.log(`- Total events received: ${eventsCount}/${sampleSize}`);
  if (receivedEventsTimes.length > 0) {
    const latencies = receivedEventsTimes.map(ev => ev.receivedAt - broadcastStartTime);
    latencies.sort((a, b) => a - b);
    const avgLat = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    console.log(`- Broadcast Latency: Avg ${avgLat.toFixed(1)}ms | p50 ${p50.toFixed(1)}ms | p95 ${p95.toFixed(1)}ms`);
  }

  // Close realtime connections
  for (const rc of realtimeClients) {
    await rc.client.removeChannel(rc.channel);
  }

  // Scenario 3: Submit Answer simultaneously
  console.log(`\nScenario 3: Simulating concurrent answer submissions...`);
  const submitPromises = [];
  const startSubmitTime = performance.now();

  for (let i = 0; i < activeParticipants.length; i++) {
    const p = activeParticipants[i];
    const sPromise = (async () => {
      const sStart = performance.now();
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await anonClient.from('answers').insert({
        participant_id: p.id,
        question_id: testQuestion.id,
        selected_option_id: correctOptionId,
        is_correct: true,
        response_time_ms: 1200,
        score_awarded: 100,
        answered_at: new Date().toISOString()
      }).select().single();

      const sDuration = performance.now() - sStart;
      if (error) {
        console.error(`- Student ${i} failed to submit answer:`, error.message);
        return null;
      }
      submitTimes.push(sDuration);
      return data;
    })();
    submitPromises.push(sPromise);
  }

  const submitResults = await Promise.all(submitPromises);
  const totalSubmitDuration = performance.now() - startSubmitTime;
  const activeSubmissions = submitResults.filter(s => s !== null);

  console.log(`Submit Results:`);
  console.log(`- Success: ${activeSubmissions.length}/${activeParticipants.length}`);
  console.log(`- Total Duration: ${totalSubmitDuration.toFixed(1)}ms`);
  if (submitTimes.length > 0) {
    submitTimes.sort((a, b) => a - b);
    const avgSub = submitTimes.reduce((sum, val) => sum + val, 0) / submitTimes.length;
    const p50 = submitTimes[Math.floor(submitTimes.length * 0.5)];
    const p95 = submitTimes[Math.floor(submitTimes.length * 0.95)];
    console.log(`- Submit Latency: Avg ${avgSub.toFixed(1)}ms | p50 ${p50.toFixed(1)}ms | p95 ${p95.toFixed(1)}ms`);
  }

  // Scenario 4: Realtime Leaderboard
  console.log(`\nScenario 4: Realtime Leaderboard query...`);
  const lStart = performance.now();
  const { data: leaderboardData, error: lErr } = await mainSupabase
    .from('participants')
    .select('id, display_name, score')
    .eq('session_id', session.id)
    .order('score', { ascending: false })
    .limit(5);

  const lDuration = performance.now() - lStart;
  if (lErr) {
    console.error('Failed to query leaderboard:', lErr);
  } else {
    console.log(`- Leaderboard fetch successful in ${lDuration.toFixed(1)}ms`);
    console.log(`- Top player: ${leaderboardData[0]?.display_name || 'None'} (Score: ${leaderboardData[0]?.score || 0})`);
  }

  // Scenario 5: Teacher ends quiz
  console.log(`\nScenario 5: Ending Quiz Session...`);
  const endStart = performance.now();
  await mainSupabase.from('quiz_sessions').update({
    status: 'completed',
    current_stage: 'finished',
    completed_at: new Date().toISOString()
  }).eq('id', session.id);
  const endDuration = performance.now() - endStart;
  console.log(`- Session status updated to completed in ${endDuration.toFixed(1)}ms`);

  // Cleanup session and data
  await cleanup(testQuiz.id, session.id, participantIds);
  console.log(`\n==================================================`);
  console.log(`SIMULATION FOR ${userCount} CONCURRENT USERS FINISHED`);
  console.log(`==================================================\n`);
  
  return {
    joinAvg: joinTimes.reduce((sum, val) => sum + val, 0) / joinTimes.length,
    joinP95: joinTimes[Math.floor(joinTimes.length * 0.95)] || 0,
    submitAvg: submitTimes.reduce((sum, val) => sum + val, 0) / submitTimes.length,
    submitP95: submitTimes[Math.floor(submitTimes.length * 0.95)] || 0,
    leaderboardDuration: lDuration
  };
}

async function run() {
  console.log('Authenticating as teacher...');
  const { data: authData, error: authErr } = await mainSupabase.auth.signInWithPassword({
    email: 'fadilafgani37@gmail.com',
    password: 'fadil123'
  });

  if (authErr || !authData.user) {
    console.error('Authentication failed. Cannot run load test.', authErr);
    process.exit(1);
  }
  const teacherId = authData.user.id;
  console.log('Authenticated successfully. Teacher ID:', teacherId);

  const results = {};
  
  try {
    results['10'] = await simulateLoad(10, teacherId);
    results['50'] = await simulateLoad(50, teacherId);
    results['100'] = await simulateLoad(100, teacherId);
    
    console.log('\n==================================================');
    console.log('SUMMARY OF AUDIT LOAD TESTING');
    console.log('==================================================');
    console.table(Object.keys(results).map(key => {
      const res = results[key];
      if (!res) return { Users: key, Status: 'Failed' };
      return {
        Users: key,
        'Avg Join (ms)': res.joinAvg.toFixed(1),
        'p95 Join (ms)': res.joinP95.toFixed(1),
        'Avg Submit (ms)': res.submitAvg.toFixed(1),
        'p95 Submit (ms)': res.submitP95.toFixed(1),
        'Leaderboard Time (ms)': res.leaderboardDuration.toFixed(1)
      };
    }));
  } catch (err) {
    console.error('Global Error in load testing simulation:', err);
  }
}

run();
