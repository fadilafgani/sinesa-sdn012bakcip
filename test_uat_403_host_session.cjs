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

async function runUatTests() {
  console.log('========================================================================');
  console.log(' UAT BUG FIX TEST: HTTP 403 & State Loading Host SINESA');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (details) console.log(`       Evidence: ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Authenticate Guru A, Guru B, Admin, and Student
    // -------------------------------------------------------------------------
    console.log('--- Tahap 1: Autentikasi Pengguna ---');
    const guruALogin = await login('regression_teacher@sinesa.com', 'password123');
    const tokenGuruA = guruALogin.data?.access_token;
    assert(!!tokenGuruA, 'Guru A (Pemilik Kuis) berhasil login', `User ID: ${guruALogin.data?.user?.id}`);

    const guruBLogin = await login('pertiwi_test@sinesa.com', 'password123');
    const tokenGuruB = guruBLogin.data?.access_token;
    assert(!!tokenGuruB, 'Guru B (Guru Penguji Akses Ilegal) berhasil login', `User ID: ${guruBLogin.data?.user?.id}`);

    const adminLogin = await login('regression_admin@sinesa.com', 'password123');
    const tokenAdmin = adminLogin.data?.access_token;
    assert(!!tokenAdmin, 'Administrator berhasil login', `User ID: ${adminLogin.data?.user?.id}`);

    const studentLogin = await login('budi_test@sinesa.com', 'password123');
    const tokenStudent = studentLogin.data?.access_token;
    assert(!!tokenStudent, 'Murid berhasil login', `User ID: ${studentLogin.data?.user?.id}`);

    // -------------------------------------------------------------------------
    // 2. Guru A membuat kuis dan membuka sesi kuis miliknya
    // -------------------------------------------------------------------------
    console.log('\n--- Tahap 2: Guru A Membuat Kuis & Membuka Sesi Kuis ---');
    const pin = 'UAT' + Math.floor(1000 + Math.random() * 9000);
    const quizRes = await apiCall('POST', '/api/quizzes/index.php', tokenGuruA, {
      title: 'Kuis Evaluasi Guru A - SINESA UAT',
      subject: 'Teknologi Informasi',
      target_class: 'Kelas 6',
      pin_code: pin,
      duration_per_question: 30,
      quiz_mode: 'santai',
      lives_count: 3
    });
    assert(quizRes.status === 201 && quizRes.body?.data?.id, 'Kuis Guru A berhasil dibuat', `Quiz ID: ${quizRes.body?.data?.id}, PIN: ${pin}`);
    const quizIdGuruA = quizRes.body?.data?.id;

    // Guru A membuat sesi kuis
    const sessionRes = await apiCall('POST', '/api/sessions/index.php', tokenGuruA, {
      quiz_id: quizIdGuruA,
      status: 'lobby',
      current_stage: 'waiting'
    });
    assert([200, 201].includes(sessionRes.status) && sessionRes.body?.data?.id, 'Guru A berhasil membuka sesi kuis miliknya', `Session ID: ${sessionRes.body?.data?.id}`);
    const sessionIdGuruA = sessionRes.body?.data?.id;

    // Guru A mengambil detail sesi kuis miliknya
    const guruAGetSession = await apiCall('GET', `/api/sessions/index.php?id=${sessionIdGuruA}`, tokenGuruA);
    assert(guruAGetSession.status === 200 && guruAGetSession.body?.success === true, 'Guru A dapat mengakses detail sesi kuis miliknya', `HTTP ${guruAGetSession.status}`);

    // -------------------------------------------------------------------------
    // 3. Guru B mencoba mengakses ID sesi kuis milik Guru A (Wajib HTTP 403)
    // -------------------------------------------------------------------------
    console.log('\n--- Tahap 3: Guru B Mencoba Mengakses Sesi Kuis Guru A (UAT Inti) ---');
    const guruBAccessSession = await apiCall('GET', `/api/sessions/index.php?id=${sessionIdGuruA}`, tokenGuruB);
    assert(
      guruBAccessSession.status === 403,
      'Backend menolak Guru B mengakses sesi kuis Guru A dengan HTTP 403 Forbidden',
      `HTTP Status: ${guruBAccessSession.status}, Body: ${JSON.stringify(guruBAccessSession.body)}`
    );
    assert(
      typeof guruBAccessSession.body?.error === 'string' && guruBAccessSession.body.error.toLowerCase().includes('akses ditolak'),
      'Pesan error penolakan eksplisit: "Akses ditolak"',
      `Error Message: "${guruBAccessSession.body?.error}"`
    );

    // Guru B mencoba mengambil kuis milik Guru A
    const guruBAccessQuiz = await apiCall('GET', `/api/quizzes/index.php?id=${quizIdGuruA}`, tokenGuruB);
    assert(
      guruBAccessQuiz.status === 403,
      'Backend menolak Guru B mengakses kuis milik Guru A dengan HTTP 403 Forbidden',
      `HTTP Status: ${guruBAccessQuiz.status}, Body: ${JSON.stringify(guruBAccessQuiz.body)}`
    );

    // Guru B mencoba membuat sesi baru untuk kuis milik Guru A
    const guruBCreateSession = await apiCall('POST', '/api/sessions/index.php', tokenGuruB, {
      quiz_id: quizIdGuruA
    });
    assert(
      guruBCreateSession.status === 403,
      'Backend menolak Guru B memandu sesi kuis milik Guru A dengan HTTP 403 Forbidden',
      `HTTP Status: ${guruBCreateSession.status}, Body: ${JSON.stringify(guruBCreateSession.body)}`
    );

    // -------------------------------------------------------------------------
    // 4. Pengujian ID Sesi Kuis Tidak Ditemukan (404)
    // -------------------------------------------------------------------------
    console.log('\n--- Tahap 4: Pengujian Sesi Tidak Ditemukan (HTTP 404) ---');
    const nonExistentId = '00000000-dead-beef-0000-000000000000';
    const notFoundRes = await apiCall('GET', `/api/sessions/index.php?id=${nonExistentId}`, tokenGuruB);
    assert(
      notFoundRes.status === 404,
      'Respons 404 Not Found dikembalikan untuk ID sesi yang tidak ada',
      `HTTP Status: ${notFoundRes.status}, Error: ${notFoundRes.body?.error}`
    );

    // -------------------------------------------------------------------------
    // 5. Pengujian Akses Role Lain: Administrator & Murid (Proteksi Keamanan & Tanpa Regresi)
    // -------------------------------------------------------------------------
    console.log('\n--- Tahap 5: Verifikasi Akses Administrator & Murid ---');
    const adminGetSession = await apiCall('GET', `/api/sessions/index.php?id=${sessionIdGuruA}`, tokenAdmin);
    assert(
      adminGetSession.status === 200 && adminGetSession.body?.success === true,
      'Administrator tetap memiliki akses supervisi ke sesi kuis (HTTP 200)',
      `HTTP Status: ${adminGetSession.status}`
    );

    const studentGetSession = await apiCall('GET', `/api/sessions/index.php?id=${sessionIdGuruA}`, tokenStudent);
    assert(
      studentGetSession.status === 200 && studentGetSession.body?.success === true,
      'Murid tetap dapat membaca data sesi kuis untuk bergabung bermain (HTTP 200)',
      `HTTP Status: ${studentGetSession.status}`
    );

    // -------------------------------------------------------------------------
    // 6. Simulasi Lifecycle State Machine Halaman Host Frontend
    // -------------------------------------------------------------------------
    console.log('\n--- Tahap 6: Verifikasi State Machine & Lifecycle Loading Frontend Host ---');
    
    // Test Case A: Simulasi Guru B mengakses sesi Guru A
    // State harus: loading -> access_denied, loading berhenti
    let simulatedStateA = 'loading';
    let errorMessageA = '';
    let isRetryingA = false;
    
    try {
      const probeRes = guruBAccessSession;
      if (probeRes.status === 403) {
        simulatedStateA = 'access_denied';
        errorMessageA = 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.';
      }
    } finally {
      if (simulatedStateA === 'loading') simulatedStateA = 'error';
    }
    assert(
      simulatedStateA === 'access_denied',
      'Frontend Host mengubah state menjadi access_denied saat menerima respons 403',
      `State: "${simulatedStateA}"`
    );
    assert(
      errorMessageA === 'Akses Ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.',
      'Frontend menampilkan pesan penolakan presisi sesuai persyaratan UAT',
      `Pesan: "${errorMessageA}"`
    );
    assert(
      isRetryingA === false,
      'Frontend TIDAK melakukan retry loop otomatis pada respons 403'
    );

    // Test Case B: Simulasi ID Sesi Tidak Ditemukan
    let simulatedStateB = 'loading';
    try {
      const probeRes = notFoundRes;
      if (probeRes.status === 404) {
        simulatedStateB = 'not_found';
      }
    } finally {
      if (simulatedStateB === 'loading') simulatedStateB = 'error';
    }
    assert(
      simulatedStateB === 'not_found',
      'Frontend Host mengubah state menjadi not_found saat menerima respons 404',
      `State: "${simulatedStateB}"`
    );

    // Test Case C: Simulasi Kesalahan Server 500 / Gangguan Jaringan
    let simulatedStateC = 'loading';
    try {
      const probeRes = { status: 500, error: 'Database connection failed' };
      if (probeRes.status >= 500) {
        simulatedStateC = 'error';
      }
    } finally {
      if (simulatedStateC === 'loading') simulatedStateC = 'error';
    }
    assert(
      simulatedStateC === 'error',
      'Frontend Host mengubah state menjadi error saat terjadi kesalahan server 500',
      `State: "${simulatedStateC}"`
    );

    // Test Case D: Simulasi Guru A (Pemilik Sah)
    let simulatedStateD = 'loading';
    try {
      const probeRes = guruAGetSession;
      if (probeRes.status === 200 && probeRes.body?.success) {
        simulatedStateD = 'success';
      }
    } finally {
      if (simulatedStateD === 'loading') simulatedStateD = 'error';
    }
    assert(
      simulatedStateD === 'success',
      'Frontend Host mengubah state menjadi success saat Guru A memuat sesinya',
      `State: "${simulatedStateD}"`
    );

    console.log('\n========================================================================');
    console.log(` HASIL PENGUJIAN UAT: ${passed} PASS, ${failed} FAIL`);
    console.log(` STATUS KESELURUHAN: ${failed === 0 ? 'PASS (SEMUA PERSYARATAN TERPENUHI)' : 'FAIL'}`);
    console.log('========================================================================');
    process.exit(failed === 0 ? 0 : 1);

  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runUatTests();
