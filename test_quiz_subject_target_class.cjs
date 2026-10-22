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
  console.log(' SINESA UAT TEST: Field Mata Pelajaran & Target Kelas');
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

  // 1. Login primary teacher
  const teacherLogin = await login('regression_teacher@sinesa.com', 'password123');
  const teacherToken = teacherLogin.data?.access_token || teacherLogin.data?.token;
  assert(teacherLogin.success && !!teacherToken, 'Teacher 1 successfully authenticated');

  // 2. Login secondary teacher for isolation check
  const teacher2Login = await login('pertiwi_test@sinesa.com', 'password123');
  const teacher2Token = teacher2Login.data?.access_token || teacher2Login.data?.token;
  assert(teacher2Login.success && !!teacher2Token, 'Teacher 2 (pertiwi_test) successfully authenticated');

  // 3. Create quiz with plain text subject and target_class
  const testTitle = `Kuis UAT Subj & Kelas - ${Date.now()}`;
  const initialSubject = 'Ilmu Pengetahuan Alam (IPA)';
  const initialTargetClass = 'Kelas 5-B';

  const createRes = await apiCall('POST', '/api/quizzes/index.php', teacherToken, {
    title: testTitle,
    subject: initialSubject,
    target_class: initialTargetClass,
    description: 'Deskripsi kuis pengujian mata pelajaran dan target kelas teks biasa.',
    duration_per_question: 45,
    quiz_mode: 'santai',
    lives_count: 5,
    random_questions: true,
    status: 'active'
  });

  assert(createRes.status === 201 && createRes.body?.success, 'Quiz created with status 201');
  const createdQuiz = createRes.body?.data;
  assert(createdQuiz?.subject === initialSubject, `Subject stored accurately on creation: "${createdQuiz?.subject}"`);
  assert(createdQuiz?.target_class === initialTargetClass, `Target Class stored accurately on creation: "${createdQuiz?.target_class}"`);
  assert(createdQuiz?.quiz_mode === 'santai', `Preserved quiz_mode: ${createdQuiz?.quiz_mode}`);
  assert(createdQuiz?.lives_count === 5, `Preserved lives_count: ${createdQuiz?.lives_count}`);
  assert(createdQuiz?.duration_per_question === 45, `Preserved timer: ${createdQuiz?.duration_per_question}`);

  const quizId = createdQuiz?.id;

  // 4. Fetch quiz directly by ID (simulate page reload / editor load)
  const fetchRes = await apiCall('GET', `/api/quizzes/index.php?id=${quizId}`, teacherToken);
  assert(fetchRes.status === 200 && fetchRes.body?.success, 'Quiz retrieved by ID with status 200');
  const fetchedQuiz = fetchRes.body?.data;
  assert(fetchedQuiz?.subject === initialSubject, `Subject reloaded consistently: "${fetchedQuiz?.subject}"`);
  assert(fetchedQuiz?.target_class === initialTargetClass, `Target Class reloaded consistently: "${fetchedQuiz?.target_class}"`);

  // 5. Update quiz: edit subject and target_class
  const updatedSubject = 'Matematika Terapan & Statistika';
  const updatedTargetClass = 'Kelas 6 Unggulan';
  const updateRes = await apiCall('PUT', `/api/quizzes/index.php?id=${quizId}`, teacherToken, {
    title: `${testTitle} (Updated)`,
    subject: updatedSubject,
    target_class: updatedTargetClass,
    quiz_mode: 'serius',
    lives_count: 3
  });

  assert(updateRes.status === 200 && updateRes.body?.success, 'Quiz updated with status 200');
  const updatedData = updateRes.body?.data;
  assert(updatedData?.subject === updatedSubject, `Subject updated accurately: "${updatedData?.subject}"`);
  assert(updatedData?.target_class === updatedTargetClass, `Target Class updated accurately: "${updatedData?.target_class}"`);
  assert(updatedData?.quiz_mode === 'serius', `Quiz mode updated: ${updatedData?.quiz_mode}`);

  // 6. Verify persistence after update via separate GET request
  const reFetchRes = await apiCall('GET', `/api/quizzes/index.php?id=${quizId}`, teacherToken);
  assert(reFetchRes.body?.data?.subject === updatedSubject, `Subject persists after reload: "${reFetchRes.body?.data?.subject}"`);
  assert(reFetchRes.body?.data?.target_class === updatedTargetClass, `Target Class persists after reload: "${reFetchRes.body?.data?.target_class}"`);

  // 7. Verify listing endpoint includes subject and target_class for dashboard cards
  const listRes = await apiCall('GET', '/api/quizzes/index.php', teacherToken);
  const foundInList = listRes.body?.data?.find(q => q.id === quizId);
  assert(!!foundInList, 'Created quiz present in teacher quizzes list');
  assert(foundInList?.subject === updatedSubject, `List item contains correct subject: "${foundInList?.subject}"`);
  assert(foundInList?.target_class === updatedTargetClass, `List item contains correct target_class: "${foundInList?.target_class}"`);

  // 8. Teacher Isolation verification
  const isolationRes = await apiCall('GET', `/api/quizzes/index.php?id=${quizId}`, teacher2Token);
  assert(isolationRes.status === 403, 'Teacher isolation active: other teacher received 403 Forbidden');

  // 9. Clean up test quiz
  const delRes = await apiCall('DELETE', `/api/quizzes/index.php?id=${quizId}`, teacherToken);
  assert(delRes.status === 200 && delRes.body?.success, 'Test quiz safely cleaned up');

  console.log('================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
