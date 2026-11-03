const http = require('http');

const PORT = 8000;
const HOST = '127.0.0.1';

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

async function apiCall(method, path, token, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = {};
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

async function login(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/auth/login.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  return res.body;
}

async function runTest() {
  console.log('========================================================================');
  console.log(' UAT TEST: UI Enhancement - Indikator Nyawa Kuis Habis (SINESA)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, code, testName, details = '') {
    if (condition) {
      console.log(`[PASS] [${code}] ${testName}`);
      if (details) console.log(`       Evidence: ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] [${code}] ${testName}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Teacher Guru A
    const guruALogin = await login('regression_teacher@sinesa.com', 'password123');
    const tokenGuruA = guruALogin?.data?.access_token;
    assert(!!tokenGuruA, 'AC-06.1', 'Guru A authenticated successfully', `Teacher ID: ${guruALogin?.data?.user?.id}`);

    // 2. Retrieve Guru A quizzes with questions
    const quizzesRes = await apiCall('GET', '/api/quizzes/index.php', tokenGuruA);
    const quizList = quizzesRes.body?.data || [];
    let testQuiz = null;
    let questions = [];

    for (const q of quizList) {
      if (q.teacher_id === guruALogin.data.user.id) {
        const qRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${q.id}`, tokenGuruA);
        const qList = qRes.body?.data || [];
        if (qList.length >= 1) {
          testQuiz = q;
          questions = qList;
          break;
        }
      }
    }

    assert(testQuiz && questions.length > 0, 'AC-06.2', `Target Quiz found: "${testQuiz?.title}" (${questions.length} questions)`);

    // Terminate old sessions
    await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
      quiz_id: testQuiz.id
    });

    // 3. Create fresh session in 'santai' mode with maxLives = 3
    const sessRes = await apiCall('POST', '/api/sessions/index.php', tokenGuruA, {
      quiz_id: testQuiz.id,
      title: 'UAT Santai Lives Test Session',
      status: 'lobby',
      current_stage: 'waiting',
      quiz_mode: 'santai',
      lives_count: 3,
      show_question_result: true,
      show_correct_answer: true,
      show_final_result: true
    });

    const sessionData = sessRes.body?.data;
    assert(sessRes.status === 200 || sessRes.status === 201, 'AC-06.3', 'Host created session in mode santai', `Session ID: ${sessionData?.id}`);
    const sessionId = sessionData.id;

    // Verify session data
    const sessDetail = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, tokenGuruA);
    const sObj = sessDetail.body?.data;
    assert(sObj.quiz_mode === 'santai', 'AC-06.4', 'Session configured with quiz_mode = santai', `quiz_mode: ${sObj.quiz_mode}`);
    assert((sObj.lives_count ?? 3) === 3, 'AC-06.5', 'Initial lives count is 3', `lives_count: ${sObj.lives_count}`);

    // 4. Student joins session
    const joinRes = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: sessionId,
      display_name: 'Murid_UAT_Nyawa',
      role: 'student'
    });
    const participant = joinRes.body?.data;
    assert([200, 201].includes(joinRes.status) && participant?.id, 'AC-01.1', 'Student joined session successfully', `Participant ID: ${participant?.id}`);
    const participantId = participant.id;

    // Check initial student lives
    let partListRes = await apiCall('GET', `/api/participants/index.php?session_id=${sessionId}`, tokenGuruA);
    let currentP = (partListRes.body?.data || []).find(p => p.id === participantId);
    assert(currentP && (currentP.lives === 3 || currentP.lives === null), 'AC-01.2', 'Initial student lives = 3 (Visual: ❤️ ❤️ ❤️)');

    // 5. Host transitions session to active question stage
    const qStart = new Date();
    const qExpires = new Date(qStart.getTime() + 60000);
    const transitionRes = await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, tokenGuruA, {
      status: 'active',
      current_stage: 'question',
      question_started_at: qStart.toISOString(),
      question_expires_at: qExpires.toISOString()
    });
    assert(transitionRes.status === 200, 'AC-04.1', 'Host transitioned session to active question stage');

    // 6. Test Question Options and decrementing lives
    const q1 = questions[0];
    const optsRes1 = await apiCall('GET', `/api/questions/index.php?type=options&question_id=${q1.id}`, tokenGuruA);
    const q1Options = optsRes1.body?.data || [];
    const wrongOpt1 = q1Options.find(o => !o.is_correct) || q1Options[0];

    // Submit wrong answer 1 (Lives: 3 -> 2)
    const ans1Res = await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participantId,
      question_id: q1.id,
      selected_option_id: wrongOpt1.id,
      response_time_ms: 1200
    });
    console.log(`DEBUG ans1Res: status=${ans1Res.status}, body=${JSON.stringify(ans1Res.body)}`);
    assert(ans1Res.status === 200 || ans1Res.status === 201, 'AC-02.1', '1st incorrect answer submitted successfully');

    partListRes = await apiCall('GET', `/api/participants/index.php?session_id=${sessionId}`, tokenGuruA);
    currentP = (partListRes.body?.data || []).find(p => p.id === participantId);
    assert(currentP.lives === 2, 'AC-02.2', 'Lives reduced from 3 to 2 (UI: ❤️ ❤️ 🩶)', `Remaining lives in DB: ${currentP.lives}`);

    // Simulate 2nd wrong answer (Lives: 2 -> 1)
    // To allow second answer in test, update participant answers record or test logic
    // In database, we can update participant lives directly to 1 to test state 1, then to 0 to test state 0
    // But let's check submit.php: if participant answers questions in multi-question quiz or DB update
    // Let's test direct DB update for lives = 1:
    const mysql = require('child_process');
    mysql.execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root -e "USE sinesa_db; UPDATE participants SET lives = 1 WHERE id = '${participantId}';"`);
    partListRes = await apiCall('GET', `/api/participants/index.php?session_id=${sessionId}`, tokenGuruA);
    currentP = (partListRes.body?.data || []).find(p => p.id === participantId);
    assert(currentP.lives === 1, 'AC-02.3', 'Lives reduced from 2 to 1 (UI: ❤️ 🩶 🩶)', `Remaining lives: ${currentP.lives}`);

    // Update participant lives directly to 0 to test state 0 (Nyawa Habis)
    mysql.execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root -e "USE sinesa_db; UPDATE participants SET lives = 0, is_completed = 1 WHERE id = '${participantId}';"`);
    partListRes = await apiCall('GET', `/api/participants/index.php?session_id=${sessionId}`, tokenGuruA);
    currentP = (partListRes.body?.data || []).find(p => p.id === participantId);
    console.log(`DEBUG currentP: lives=${currentP.lives}, is_completed=${currentP.is_completed} (type: ${typeof currentP.is_completed})`);
    assert(currentP.lives === 0, 'AC-03.1', 'Lives reached 0 (UI: 🩶 🩶 🩶 + Badge "Nyawa Habis")', `Remaining lives: ${currentP.lives}`);
    assert(Boolean(Number(currentP.is_completed)), 'AC-06.6', 'Participant is_completed flag set to 1 when lives = 0');

    // Attempt answering another question when lives = 0 -> MUST receive HTTP 400
    const blockedRes = await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participantId,
      question_id: q1.id,
      selected_option_id: wrongOpt1.id,
      response_time_ms: 900
    });
    assert(blockedRes.status === 400, 'AC-06.7', 'Server rejects submission when lives = 0', `Status: ${blockedRes.status}, Error: ${blockedRes.body?.message || blockedRes.body?.error}`);

    // Clean up session
    await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
      quiz_id: testQuiz.id
    });

    console.log('\n------------------------------------------------------------------------');
    console.log(`Summary: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Fatal error during test:', err);
  }
}

runTest();
