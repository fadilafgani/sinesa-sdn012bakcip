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

async function run() {
  console.log('================================================================');
  console.log(' SINESA UAT TEST: Question Reordering (Drag-and-Drop & Move)');
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

  // 1. Authenticate teacher
  const teacherLogin = await login('regression_teacher@sinesa.com', 'password123');
  const teacherToken = teacherLogin.data?.access_token || teacherLogin.data?.token;
  assert(teacherLogin.success && !!teacherToken, 'Teacher successfully authenticated');

  // 2. Create quiz with 3 questions
  const quizTitle = `UAT Reorder Test - ${Date.now()}`;
  const quizRes = await apiCall('POST', '/api/quizzes/index.php', teacherToken, {
    title: quizTitle,
    subject: 'Fisika Dasar',
    target_class: 'Kelas 5',
    description: 'Pengujian pengurutan soal 1, 2, 3 ke 3, 1, 2',
    duration_per_question: 30,
    quiz_mode: 'serius',
    status: 'active'
  });

  assert(quizRes.status === 201 && quizRes.body?.success, 'Quiz created with status 201');
  const quizId = quizRes.body?.data?.id;

  // Insert 3 initial questions in order: Q1, Q2, Q3
  const initialQuestions = [
    { text: 'Soal #1: Apakah satuan gaya dalam SI?', order: 0 },
    { text: 'Soal #2: Berapakah percepatan gravitasi bumi?', order: 1 },
    { text: 'Soal #3: Hukum Newton keberapa tentang aksi-reaksi?', order: 2 }
  ];

  for (const q of initialQuestions) {
    const qRes = await apiCall('POST', '/api/questions/index.php', teacherToken, {
      quiz_id: quizId,
      question_text: q.text,
      question_type: 'multiple_choice',
      media_type: 'text',
      points: 100,
      order_index: q.order,
      options: [
        { option_text: 'Opsi A Benar', is_correct: 1 },
        { option_text: 'Opsi B Salah', is_correct: 0 }
      ]
    });
    assert(qRes.status === 201 && qRes.body?.success, `Created initial question at order_index=${q.order}`);
  }

  // 3. Verify initial fetch order
  const getInitialRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, teacherToken);
  assert(getInitialRes.status === 200 && getInitialRes.body?.data?.length === 3, 'Fetched 3 initial questions');
  const initialList = getInitialRes.body?.data || [];
  assert(initialList[0].question_text === initialQuestions[0].text, `Initial #1 is: "${initialList[0].question_text}"`);
  assert(initialList[1].question_text === initialQuestions[1].text, `Initial #2 is: "${initialList[1].question_text}"`);
  assert(initialList[2].question_text === initialQuestions[2].text, `Initial #3 is: "${initialList[2].question_text}"`);

  // 4. Simulate Reordering: Drag question #3 (Index 2) to first position (Index 0)
  // New target order: Soal #3, Soal #1, Soal #2
  console.log('\n--- Simulating Drag Q3 to position 1 (New order: Q3, Q1, Q2) ---');
  const reorderedQuestions = [
    initialList[2], // Soal #3 -> Index 0
    initialList[0], // Soal #1 -> Index 1
    initialList[1], // Soal #2 -> Index 2
  ];

  // In quiz-editor onSubmit: existing questions are purged and re-inserted with new order_index
  const delQuestionsRes = await apiCall('DELETE', `/api/questions/index.php?quiz_id=${quizId}`, teacherToken);
  assert(delQuestionsRes.status === 200, 'Existing questions purged for atomic re-insertion');

  for (let i = 0; i < reorderedQuestions.length; i++) {
    const q = reorderedQuestions[i];
    const insRes = await apiCall('POST', '/api/questions/index.php', teacherToken, {
      quiz_id: quizId,
      question_text: q.question_text,
      question_type: q.question_type || 'multiple_choice',
      media_type: q.media_type || 'text',
      points: q.points || 100,
      order_index: i,
      options: [
        { option_text: 'Opsi A Benar', is_correct: 1 },
        { option_text: 'Opsi B Salah', is_correct: 0 }
      ]
    });
    assert(insRes.status === 201 && insRes.body?.success, `Re-inserted "${q.question_text}" at order_index=${i}`);
  }

  // 5. Fetch questions directly after reordering
  const getReorderedRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, teacherToken);
  const reorderedList = getReorderedRes.body?.data || [];
  assert(reorderedList.length === 3, 'Fetched 3 reordered questions');
  assert(reorderedList[0].question_text === initialQuestions[2].text, `Position 1 is now: "${reorderedList[0].question_text}" (Was Soal #3)`);
  assert(reorderedList[1].question_text === initialQuestions[0].text, `Position 2 is now: "${reorderedList[1].question_text}" (Was Soal #1)`);
  assert(reorderedList[2].question_text === initialQuestions[1].text, `Position 3 is now: "${reorderedList[2].question_text}" (Was Soal #2)`);

  // 6. Simulate page refresh / cold fetch to ensure permanent persistence
  console.log('\n--- Cold Fetch / Simulated Page Reload ---');
  const coldFetchRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, teacherToken);
  const coldList = coldFetchRes.body?.data || [];
  assert(coldList[0].question_text === initialQuestions[2].text, 'Cold reload: Position 1 consistently remains Soal #3');
  assert(coldList[1].question_text === initialQuestions[0].text, 'Cold reload: Position 2 consistently remains Soal #1');
  assert(coldList[2].question_text === initialQuestions[1].text, 'Cold reload: Position 3 consistently remains Soal #2');

  // 7. Clean up test quiz
  const delQuizRes = await apiCall('DELETE', `/api/quizzes/index.php?id=${quizId}`, teacherToken);
  assert(delQuizRes.status === 200, 'Test quiz cleaned up');

  console.log('\n================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
