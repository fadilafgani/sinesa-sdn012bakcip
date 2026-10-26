const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
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
    hostname: '127.0.0.1',
    port: 80,
    path: '/api/auth/login.php',
    method: 'POST',
    headers: {
      'Host': 'evaluasi-bakcip.test',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  return res.body;
}

async function apiCall(method, path, token, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = {
    'Host': 'evaluasi-bakcip.test',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  const res = await request({
    hostname: '127.0.0.1',
    port: 80,
    path,
    method,
    headers
  }, payload);
  return res;
}

async function runTests() {
  console.log('================================================================');
  console.log(' SINESA UAT TEST: Durasi Timer per Soal (Question Timer)');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Teacher
    const loginRes = await login('regression_teacher@sinesa.com', 'password123');
    const teacherToken = loginRes.data?.access_token || loginRes.data?.token;
    assert(!!teacherToken, 'Teacher successfully authenticated');

    // 2. Create Master Quiz with global duration = 25s
    const pin = 'TMR' + Math.floor(1000 + Math.random() * 9000);
    const quizPayload = {
      title: 'Kuis UAT Timer Per Soal',
      subject: 'Fisika & Matematika',
      target_class: 'Kelas 6-A',
      description: 'Pengujian durasi timer berbeda pada setiap soal kuis',
      pin_code: pin,
      duration_per_question: 25, // Global baseline
      quiz_mode: 'santai',
      lives_count: 3
    };

    const createQuizRes = await apiCall('POST', '/api/quizzes/index.php', teacherToken, quizPayload);
    assert(createQuizRes.status === 201 && createQuizRes.body?.data?.id, 'Master quiz created successfully');
    const quizId = createQuizRes.body?.data?.id;

    // 3. Create 3 Questions with 3 DISTINCT durations:
    // Soal 1 = 20 detik
    // Soal 2 = 30 detik
    // Soal 3 = 45 detik
    const q1Res = await apiCall('POST', '/api/questions/index.php', teacherToken, {
      quiz_id: quizId,
      question_text: 'Soal 1: Waktu kilat 20 detik (Perhitungan Cepat)',
      question_type: 'multiple_choice',
      points: 100,
      duration: 20, // 20s
      order_index: 0,
      options: [
        { option_text: 'Opsi A (Benar)', is_correct: true },
        { option_text: 'Opsi B', is_correct: false }
      ]
    });
    assert(q1Res.status === 201 && q1Res.body?.data?.id, 'Soal 1 created with status 201');
    const q1Id = q1Res.body?.data?.id;
    assert(Number(q1Res.body?.data?.duration) === 20, 'Soal 1 returns duration = 20s in API response');

    const q2Res = await apiCall('POST', '/api/questions/index.php', teacherToken, {
      quiz_id: quizId,
      question_text: 'Soal 2: Waktu standar 30 detik (Konsep Logika)',
      question_type: 'multiple_choice',
      points: 100,
      duration: 30, // 30s
      order_index: 1,
      options: [
        { option_text: 'Pilihan Benar', is_correct: true },
        { option_text: 'Pilihan Salah', is_correct: false }
      ]
    });
    assert(q2Res.status === 201 && q2Res.body?.data?.id, 'Soal 2 created with status 201');
    const q2Id = q2Res.body?.data?.id;
    assert(Number(q2Res.body?.data?.duration) === 30, 'Soal 2 returns duration = 30s in API response');

    const q3Res = await apiCall('POST', '/api/questions/index.php', teacherToken, {
      quiz_id: quizId,
      question_text: 'Soal 3: Waktu panjang 45 detik (Analisis Rumit)',
      question_type: 'multiple_choice',
      points: 100,
      duration: 45, // 45s
      order_index: 2,
      options: [
        { option_text: 'Jawaban Tepat', is_correct: true },
        { option_text: 'Jawaban Keliru', is_correct: false }
      ]
    });
    assert(q3Res.status === 201 && q3Res.body?.data?.id, 'Soal 3 created with status 201');
    const q3Id = q3Res.body?.data?.id;
    assert(Number(q3Res.body?.data?.duration) === 45, 'Soal 3 returns duration = 45s in API response');

    // 4. Fetch list of questions for this quiz and verify individual durations persist
    const listQsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, teacherToken);
    const questionsList = listQsRes.body?.data || [];
    assert(listQsRes.status === 200 && Array.isArray(questionsList) && questionsList.length === 3, 'Fetched 3 questions');

    const fetchedQ1 = questionsList.find(q => q.id === q1Id);
    const fetchedQ2 = questionsList.find(q => q.id === q2Id);
    const fetchedQ3 = questionsList.find(q => q.id === q3Id);

    assert(Number(fetchedQ1?.duration) === 20, 'Persisted Question 1 has duration 20s');
    assert(Number(fetchedQ2?.duration) === 30, 'Persisted Question 2 has duration 30s');
    assert(Number(fetchedQ3?.duration) === 45, 'Persisted Question 3 has duration 45s');

    // 5. Test update duration on Question 2 (modify from 30s to 50s)
    const updateQ2Res = await apiCall('PUT', `/api/questions/index.php?id=${q2Id}`, teacherToken, {
      duration: 50
    });
    assert(updateQ2Res.status === 200, 'Question 2 updated with status 200');
    assert(Number(updateQ2Res.body?.data?.duration) === 50, 'Updated Question 2 returns duration 50s');

    // Restore Q2 back to 30s for session tests
    await apiCall('PUT', `/api/questions/index.php?id=${q2Id}`, teacherToken, { duration: 30 });

    // 6. Test active gameplay session stage transitions and question expiration timestamps
    // Create Session
    const sessRes = await apiCall('POST', '/api/sessions/index.php', teacherToken, {
      quiz_id: quizId,
      host_id: loginRes.data?.user?.id,
      status: 'lobby',
      current_stage: 'waiting',
      current_question_index: -1,
      quiz_mode: 'santai',
      lives_count: 3
    });
    assert(sessRes.status === 201 && sessRes.body?.data?.id, 'Quiz session initialized with status 201');
    const sessionId = sessRes.body?.data?.id;

    // Join Participant (Student)
    const partRes = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: sessionId,
      display_name: 'Murid UAT Timer',
      score: 0,
      lives: 3
    });
    assert(partRes.status === 201 && partRes.body?.data?.id, 'Participant joined session');
    const participantId = partRes.body?.data?.id;

    // --- TRANSITION 1: Move to Soal #1 (duration = 20s) ---
    const now1 = new Date();
    const expires1 = new Date(now1.getTime() + 20 * 1000);
    const stage1Res = await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, teacherToken, {
      status: 'active',
      current_stage: 'question',
      current_question_index: 0,
      question_started_at: now1.toISOString(),
      question_expires_at: expires1.toISOString()
    });
    assert(stage1Res.status === 200, 'Session moved to Question #1');

    // Verify session state reflects 20s window
    const verifySess1 = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, null);
    const q1Expires = new Date(verifySess1.body?.data?.question_expires_at).getTime();
    const q1Started = new Date(verifySess1.body?.data?.question_started_at).getTime();
    const diffSec1 = Math.round((q1Expires - q1Started) / 1000);
    assert(diffSec1 === 20, `Question #1 expires_at - started_at window is exactly 20s (got ${diffSec1}s)`);

    // Fetch options for Soal 1
    const q1OptsRes = await apiCall('GET', `/api/questions/index.php?question_id=${q1Id}&type=options`, null);
    const q1Opts = q1OptsRes.body?.data || q1OptsRes.body || [];
    const correctOpt1 = q1Opts.find(o => o.is_correct) || q1Opts[0];

    // Participant answers Question #1
    const ans1Res = await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participantId,
      question_id: q1Id,
      selected_option_id: correctOpt1?.id || ''
    });
    assert((ans1Res.status === 200 || ans1Res.status === 201) && ans1Res.body?.data?.is_correct === true, 'Question #1 answered correctly (status 201/200)');

    // Test duplicate submission guard (Race Condition prevention)
    const dupRes = await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participantId,
      question_id: q1Id,
      selected_option_id: correctOpt1?.id || ''
    });
    assert(dupRes.status === 409, 'Duplicate submission blocked with HTTP 409 (Race condition prevented)');

    // --- TRANSITION 2: Move to Soal #2 (duration = 30s) ---
    const now2 = new Date();
    const expires2 = new Date(now2.getTime() + 30 * 1000);
    const stage2Res = await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, teacherToken, {
      current_stage: 'question',
      current_question_index: 1,
      question_started_at: now2.toISOString(),
      question_expires_at: expires2.toISOString()
    });
    assert(stage2Res.status === 200, 'Session moved to Question #2');

    const verifySess2 = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, null);
    const q2Expires = new Date(verifySess2.body?.data?.question_expires_at).getTime();
    const q2Started = new Date(verifySess2.body?.data?.question_started_at).getTime();
    const diffSec2 = Math.round((q2Expires - q2Started) / 1000);
    assert(diffSec2 === 30, `Question #2 expires_at - started_at window is exactly 30s (got ${diffSec2}s)`);

    // Fetch options for Soal 2
    const q2OptsRes = await apiCall('GET', `/api/questions/index.php?question_id=${q2Id}&type=options`, null);
    const q2Opts = q2OptsRes.body?.data || q2OptsRes.body || [];
    const correctOpt2 = q2Opts.find(o => o.is_correct) || q2Opts[0];

    // Participant answers Question #2
    const ans2Res = await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participantId,
      question_id: q2Id,
      selected_option_id: correctOpt2?.id || ''
    });
    assert((ans2Res.status === 200 || ans2Res.status === 201) && ans2Res.body?.data?.is_correct === true, 'Question #2 answered correctly (status 201/200)');

    // --- TRANSITION 3: Move to Soal #3 (duration = 45s) ---
    const now3 = new Date();
    const expires3 = new Date(now3.getTime() + 45 * 1000);
    const stage3Res = await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, teacherToken, {
      current_stage: 'question',
      current_question_index: 2,
      question_started_at: now3.toISOString(),
      question_expires_at: expires3.toISOString()
    });
    assert(stage3Res.status === 200, 'Session moved to Question #3');

    const verifySess3 = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, null);
    const q3Expires = new Date(verifySess3.body?.data?.question_expires_at).getTime();
    const q3Started = new Date(verifySess3.body?.data?.question_started_at).getTime();
    const diffSec3 = Math.round((q3Expires - q3Started) / 1000);
    assert(diffSec3 === 45, `Question #3 expires_at - started_at window is exactly 45s (got ${diffSec3}s)`);

    // Clean up test quiz & session
    await apiCall('DELETE', `/api/quizzes/index.php?id=${quizId}`, teacherToken);
    console.log('[PASS] Test quiz and associated questions/sessions safely cleaned up');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
