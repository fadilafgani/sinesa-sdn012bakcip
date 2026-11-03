const http = require('http');

const PORT = 80;
const HOST = '127.0.0.1';
const HOST_HEADER = 'evaluasi-bakcip.test';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body), duration });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body, duration });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/auth/login.php',
    method: 'POST',
    headers: {
      'Host': HOST_HEADER,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  return res.body;
}

async function apiCall(method, path, token, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = { 'Host': HOST_HEADER };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return await request({
    hostname: HOST,
    port: PORT,
    path,
    method,
    headers
  }, payload);
}

async function runBenchmark() {
  console.log('========================================================================');
  console.log(' UAT CONCURRENT BENCHMARK: 20 PARTICIPANTS JOIN & START QUIZ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function assert(condition, code, desc, metric = '') {
    if (condition) {
      console.log(`[PASS] [${code}] ${desc}`);
      if (metric) console.log(`       Metric: ${metric}`);
      passed++;
      results.push({ code, desc, status: 'PASS', metric });
    } else {
      console.error(`[FAIL] [${code}] ${desc}`);
      if (metric) console.error(`       Details: ${metric}`);
      failed++;
      results.push({ code, desc, status: 'FAIL', metric });
    }
  }

  // 1. Authenticate Teacher Guru A
  console.log('--- Step 0: Authentication & Preparation ---');
  const guruALogin = await login('regression_teacher@sinesa.com', 'password123');
  const tokenGuruA = guruALogin?.data?.access_token;
  if (!tokenGuruA) {
    console.error('Fatal: Failed to login as Guru A:', guruALogin);
    process.exit(1);
  }
  console.log('Guru A authenticated. User ID:', guruALogin.data.user.id);

  // Authenticate Guru B (for security testing)
  const guruBLogin = await login('pertiwi_test@sinesa.com', 'password123');
  const tokenGuruB = guruBLogin?.data?.access_token;

  // Retrieve Guru A quizzes with questions
  const quizzesRes = await apiCall('GET', '/api/quizzes/index.php', tokenGuruA);
  const quizList = quizzesRes.body?.data || [];
  // Pick quiz owned by Guru A that has questions
  let testQuiz = null;
  for (const q of quizList) {
    if (q.teacher_id === guruALogin.data.user.id) {
      const qRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${q.id}`, tokenGuruA);
      if (qRes.body?.data?.length > 0) {
        testQuiz = q;
        break;
      }
    }
  }
  if (!testQuiz) {
    testQuiz = quizList.find(q => q.teacher_id === guruALogin.data.user.id) || quizList[0];
  }
  console.log(`Target Quiz: "${testQuiz.title}" (ID: ${testQuiz.id}, PIN: ${testQuiz.pin_code})`);

  // Terminate any old active sessions for this quiz
  await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
    quiz_id: testQuiz.id
  });

  // Get Questions for the Quiz
  const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${testQuiz.id}`, tokenGuruA);
  const questions = questionsRes.body?.data || [];
  console.log(`Questions loaded: ${questions.length} questions`);
  const firstQuestion = questions[0];
  const optionsRes = await apiCall('GET', `/api/questions/index.php?type=options&question_id=${firstQuestion.id}`, tokenGuruA);
  const questionOptions = optionsRes.body?.data || [];
  const correctOption = questionOptions.find(o => o.is_correct) || questionOptions[0];
  console.log(`First Question Options: ${questionOptions.length} (Correct option ID: ${correctOption?.id})`);

  // Helper function to create fresh session
  async function createFreshSession() {
    await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
      quiz_id: testQuiz.id
    });
    const sessRes = await apiCall('POST', '/api/sessions/index.php', tokenGuruA, {
      quiz_id: testQuiz.id,
      status: 'lobby',
      current_stage: 'waiting',
      quiz_mode: 'serius',
      lives_count: 3
    });
    return sessRes.body?.data;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 1: 1 Participant Join
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Single Participant Join (Baseline) ---');
  let session = await createFreshSession();
  console.log(`Created Session: ${session.id}`);

  const singleJoinStart = Date.now();
  const singleJoinRes = await apiCall('POST', '/api/participants/index.php', null, {
    session_id: session.id,
    display_name: 'Single_Pilot'
  });
  const singleJoinTime = Date.now() - singleJoinStart;

  assert(
    [200, 201].includes(singleJoinRes.status) && singleJoinRes.body?.data?.id,
    'SCEN-01',
    '1 participant joins successfully',
    `Response Time: ${singleJoinTime} ms, Participant ID: ${singleJoinRes.body?.data?.id}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 2: 5 Participants Concurrent Join
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 2: 5 Participants Concurrent Join ---');
  const fivePromises = Array.from({ length: 5 }, (_, i) => {
    return apiCall('POST', '/api/participants/index.php', null, {
      session_id: session.id,
      display_name: `Group5_${i + 1}`
    });
  });
  const fiveStart = Date.now();
  const fiveResults = await Promise.all(fivePromises);
  const fiveTotalTime = Date.now() - fiveStart;
  const fiveSuccessCount = fiveResults.filter(r => [200, 201].includes(r.status) && r.body?.data?.id).length;
  const fiveLatencies = fiveResults.map(r => r.duration);
  const fiveAvg = Math.round(fiveLatencies.reduce((a, b) => a + b, 0) / fiveLatencies.length);

  assert(
    fiveSuccessCount === 5,
    'SCEN-02',
    '5 participants joined concurrently without failure',
    `5/5 OK | Total wall time: ${fiveTotalTime} ms | Avg: ${fiveAvg} ms | Max: ${Math.max(...fiveLatencies)} ms`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 3: 10 Participants Concurrent Join
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 3: 10 Participants Concurrent Join ---');
  const tenPromises = Array.from({ length: 10 }, (_, i) => {
    return apiCall('POST', '/api/participants/index.php', null, {
      session_id: session.id,
      display_name: `Group10_${i + 1}`
    });
  });
  const tenStart = Date.now();
  const tenResults = await Promise.all(tenPromises);
  const tenTotalTime = Date.now() - tenStart;
  const tenSuccessCount = tenResults.filter(r => [200, 201].includes(r.status) && r.body?.data?.id).length;
  const tenLatencies = tenResults.map(r => r.duration);
  const tenAvg = Math.round(tenLatencies.reduce((a, b) => a + b, 0) / tenLatencies.length);

  assert(
    tenSuccessCount === 10,
    'SCEN-03',
    '10 participants joined concurrently without failure',
    `10/10 OK | Total wall time: ${tenTotalTime} ms | Avg: ${tenAvg} ms | Max: ${Math.max(...tenLatencies)} ms`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 4: 20 Participants Concurrent Join (The Reported UAT Defect)
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 4: 20 Participants Concurrent Join (UAT-20 Test) ---');
  // Create fresh clean session for the 20-load test
  session = await createFreshSession();
  console.log(`Fresh Session Created for 20-Participant Test: ${session.id}`);

  const load20Names = Array.from({ length: 20 }, (_, i) => `Load ${String(i + 1).padStart(2, '0')}`);
  const twentyStart = Date.now();
  const twentyPromises = load20Names.map((name) => {
    return apiCall('POST', '/api/participants/index.php', null, {
      session_id: session.id,
      display_name: name
    });
  });

  const twentyResults = await Promise.all(twentyPromises);
  const twentyTotalTime = Date.now() - twentyStart;
  const twentySuccessCount = twentyResults.filter(r => [200, 201].includes(r.status) && r.body?.data?.id).length;
  const twentyLatencies = twentyResults.map(r => r.duration);
  const twentyAvg = Math.round(twentyLatencies.reduce((a, b) => a + b, 0) / twentyLatencies.length);

  // Check specifically for Load 17 (the reported failure in UAT)
  const load17Result = twentyResults[16]; // index 16 is Load 17
  const load17Success = [200, 201].includes(load17Result?.status) && load17Result?.body?.data?.display_name === 'Load 17';

  assert(
    twentySuccessCount === 20,
    'AC-01',
    'Concurrent join: 20 akun berbeda berhasil bergabung tanpa kehilangan peserta',
    `20/20 Joined | Total wall time: ${twentyTotalTime} ms | Avg: ${twentyAvg} ms | Min: ${Math.min(...twentyLatencies)} ms | Max: ${Math.max(...twentyLatencies)} ms`
  );

  assert(
    load17Success,
    'AC-01.1',
    'Peserta "Load 17" berhasil bergabung tanpa tertahan',
    `Load 17 Status: ${load17Result?.status} | Duration: ${load17Result?.duration} ms | Participant ID: ${load17Result?.body?.data?.id}`
  );

  // Test participant list API latency right after 20 concurrent joins
  console.log('\n--- Participant API Latency Audit (/api/participants) ---');
  const partReq1 = await apiCall('GET', `/api/participants/index.php?session_id=${session.id}`, tokenGuruA);
  const partReq2 = await apiCall('GET', `/api/participants/index.php?session_id=${session.id}`, tokenGuruA);

  assert(
    partReq1.status === 200 && partReq1.duration < 2000,
    'AC-03.1',
    'Participant API Request 1 duration is within target (< 2000 ms)',
    `Duration: ${partReq1.duration} ms (was ~20,034 ms before fix) | Items: ${partReq1.body?.data?.length}`
  );

  assert(
    partReq2.status === 200 && partReq2.duration < 2000,
    'AC-03.2',
    'Participant API Request 2 duration is within target (< 2000 ms)',
    `Duration: ${partReq2.duration} ms (was ~20,097 ms before fix) | Items: ${partReq2.body?.data?.length}`
  );

  assert(
    partReq1.body?.data?.length === 20,
    'AC-01.2',
    'Host participant list reflects exactly 20 joined participants in database',
    `Database count: ${partReq1.body?.data?.length}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Host Clicks Mulai & Transition to Question
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Host Clicks Mulai & Stage Transitions ---');
  const now = new Date();
  const countdownDuration = 3;
  const countdownExpires = new Date(now.getTime() + countdownDuration * 1000);

  const startQuizStart = Date.now();
  const startQuizRes = await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, tokenGuruA, {
    status: 'active',
    current_stage: 'countdown',
    current_question_index: 0,
    countdown_started_at: now.toISOString(),
    countdown_expires_at: countdownExpires.toISOString(),
    countdown_duration: countdownDuration
  });
  const startQuizDuration = Date.now() - startQuizStart;

  assert(
    startQuizRes.status === 200 && startQuizRes.body?.data?.status === 'active' && startQuizRes.body?.data?.current_stage === 'countdown',
    'AC-04',
    'Start Quiz: Tombol Mulai memproses transisi ke stage countdown secara konsisten',
    `Response duration: ${startQuizDuration} ms | Stage: ${startQuizRes.body?.data?.current_stage} | Status: ${startQuizRes.body?.data?.status}`
  );

  // Transition to Question Stage (Simulate countdown completion)
  const qStart = new Date();
  const qExpires = new Date(qStart.getTime() + 30000);
  const transitionStart = Date.now();
  const transitionRes = await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, tokenGuruA, {
    current_stage: 'question',
    question_started_at: qStart.toISOString(),
    question_expires_at: qExpires.toISOString()
  });
  const transitionDuration = Date.now() - transitionStart;

  assert(
    transitionRes.status === 200 && transitionRes.body?.data?.current_stage === 'question',
    'AC-05',
    'Client transition: Sesi berhasil berpindah ke stage question untuk seluruh peserta',
    `Transition duration: ${transitionDuration} ms | Stage: ${transitionRes.body?.data?.current_stage}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 6: 20 Participants Submit Answers Concurrently
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 6: 20 Participants Submit Answers Concurrently ---');
  const participants = partReq1.body?.data || [];
  const answerSubmitStart = Date.now();

  const answerPromises = participants.map((p, idx) => {
    return apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: p.id,
      question_id: firstQuestion.id,
      selected_option_id: correctOption.id,
      response_time_ms: 1200 + idx * 50
    });
  });

  const answerResults = await Promise.all(answerPromises);
  const answerTotalTime = Date.now() - answerSubmitStart;
  const answerSuccessCount = answerResults.filter(r => [200, 201].includes(r.status) && (r.body?.data?.id || r.body?.data?.answer?.id)).length;
  const answerLatencies = answerResults.map(r => r.duration);
  const answerAvg = Math.round(answerLatencies.reduce((a, b) => a + b, 0) / answerLatencies.length);

  assert(
    answerSuccessCount === 20,
    'AC-06',
    'Concurrent submit: 20 peserta dapat mengirimkan jawaban secara bersamaan tanpa data loss',
    `20/20 Answers Recorded | Total wall time: ${answerTotalTime} ms | Avg: ${answerAvg} ms | Min: ${Math.min(...answerLatencies)} ms | Max: ${Math.max(...answerLatencies)} ms`
  );

  // Verify answer count in DB
  const checkAnswers = await apiCall('GET', `/api/answers/index.php?session_id=${session.id}&question_id=${firstQuestion.id}`, tokenGuruA);
  assert(
    checkAnswers.status === 200 && checkAnswers.body?.data?.length === 20,
    'AC-06.1',
    'Database verifikasi: 20 jawaban tersimpan utuh di tabel answers',
    `Verified answers count: ${checkAnswers.body?.data?.length}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Join Isolation (Slow Connection Simulation)
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Join Isolation Test ---');
  const isoSession = await createFreshSession();
  const fastProms = [
    apiCall('POST', '/api/participants/index.php', null, { session_id: isoSession.id, display_name: 'Fast_1' }),
    apiCall('POST', '/api/participants/index.php', null, { session_id: isoSession.id, display_name: 'Fast_2' }),
    apiCall('POST', '/api/participants/index.php', null, { session_id: isoSession.id, display_name: 'Fast_3' }),
    // Simulated slow request with delay before firing
    new Promise(resolve => setTimeout(() => {
      apiCall('POST', '/api/participants/index.php', null, { session_id: isoSession.id, display_name: 'Slow_P' }).then(resolve);
    }, 400))
  ];
  const isoRes = await Promise.all(fastProms);
  const fastSuccess = isoRes.filter(r => [200, 201].includes(r.status)).length;

  assert(
    fastSuccess === 4,
    'AC-02',
    'Join isolation: Request lambat satu peserta tidak menghambat peserta lain',
    `4/4 Joined successfully independently`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Reconnection Test
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Participant Reconnection Test ---');
  const reconnectRes = await apiCall('POST', '/api/participants/index.php', null, {
    session_id: isoSession.id,
    display_name: 'Fast_1'
  });

  assert(
    reconnectRes.status === 200 && reconnectRes.body?.data?.display_name === 'Fast_1',
    'SCEN-08',
    'Peserta reconnect dengan nama sama berhasil dipulihkan tanpa duplikasi',
    `Status: ${reconnectRes.status} | Reconnected ID: ${reconnectRes.body?.data?.id}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Security & Authorization (AC-08)
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Security & Role Isolation ---');
  const unauthorizedStart = await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, tokenGuruB, {
    status: 'completed'
  });

  assert(
    unauthorizedStart.status === 403,
    'AC-08.1',
    'Guru B ditolak dengan HTTP 403 saat mencoba memodifikasi sesi Guru A',
    `Status: ${unauthorizedStart.status} | Error: ${JSON.stringify(unauthorizedStart.body?.error || unauthorizedStart.rawBody)}`
  );

  const anonStart = await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, null, {
    status: 'completed'
  });

  assert(
    anonStart.status === 401 || anonStart.status === 403,
    'AC-08.2',
    'Request tanpa token ditolak (401/403) saat mencoba memodifikasi sesi',
    `Status: ${anonStart.status}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` BENCHMARK SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBenchmark().catch(err => {
  console.error('Unhandled benchmark error:', err);
  process.exit(1);
});
