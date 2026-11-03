const http = require('http');
const { execSync } = require('child_process');

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

async function apiCall(method, path, token = null, body = null) {
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
  const res = await apiCall('POST', '/api/auth/login.php', null, { email, password });
  return res.body;
}

async function runAccuracySuite() {
  console.log('========================================================================');
  console.log(' UAT TEST SUITE: Final Quiz Summary Accuracy & Statistics (SINESA)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, code, name, details = '') {
    if (condition) {
      console.log(`[PASS] [${code}] ${name}`);
      if (details) console.log(`       Evidence: ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] [${code}] ${name}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  try {
    const loginRes = await login('regression_teacher@sinesa.com', 'password123');
    const token = loginRes?.data?.access_token || loginRes?.data?.token;
    const teacherId = loginRes?.data?.user?.id;
    if (!token || !teacherId) {
      throw new Error('Failed to login teacher: ' + JSON.stringify(loginRes));
    }

    // Ensure 5-question test quiz exists
    execSync('php setup_test_quiz.php');

    const quizId = 'quiz-uat-timeout-5q';
    const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, token);
    const questions = questionsRes.body?.data || [];

    const qDetails = [];
    for (const q of questions) {
      const optRes = await apiCall('GET', `/api/questions/index.php?type=options&question_id=${q.id}`, token);
      const opts = optRes.body?.data || [];
      const correctOpt = opts.find(o => o.is_correct);
      const wrongOpt = opts.find(o => !o.is_correct);
      qDetails.push({ question: q, options: opts, correctOpt, wrongOpt });
    }

    console.log(`Loaded Quiz: "Kuis UAT Timeout 5 Soal" with ${qDetails.length} questions.\n`);

    async function setupSession(pin, mode = 'serius', lives = 3) {
      const createRes = await apiCall('POST', '/api/sessions/index.php', token, {
        quiz_id: quizId,
        pin_code: pin,
        quiz_mode: mode,
        lives_count: lives,
        show_correct_answer: true,
        show_final_result: true,
        show_leaderboard: true,
      });
      const session = createRes.body?.data;
      if (!session) throw new Error('Failed to create session: ' + JSON.stringify(createRes));

      await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, token, {
        status: 'active',
        current_stage: 'question',
        current_question_index: 0,
      });

      return session;
    }

    async function joinParticipant(sessionId, name) {
      const joinRes = await apiCall('POST', '/api/participants/index.php', null, {
        session_id: sessionId,
        display_name: name,
      });
      return joinRes.body?.data;
    }

    async function submitAnswer(participantId, sessionId, questionId, optionId, isTimeout = false) {
      return await apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: participantId,
        question_id: questionId,
        selected_option_id: optionId || null,
        response_time_ms: 1200,
        is_timeout: isTimeout,
      });
    }

    async function completeParticipant(participantId) {
      return await apiCall('PUT', `/api/participants/index.php?id=${participantId}`, null, {
        is_completed: true,
      });
    }

    async function getParticipant(participantId) {
      const res = await apiCall('GET', `/api/participants/index.php?id=${participantId}`);
      return res.body?.data;
    }

    // -------------------------------------------------------------------------
    // RT-01: Semua jawaban benar -> Akurasi 100%
    // -------------------------------------------------------------------------
    console.log('--- RT-01: Semua Jawaban Benar (100% Akurasi) ---');
    const sess1 = await setupSession('881001', 'serius');
    const part1 = await joinParticipant(sess1.id, 'Murid_RT01_100pct');

    for (let i = 0; i < qDetails.length; i++) {
      const { question, correctOpt } = qDetails[i];
      await submitAnswer(part1.id, sess1.id, question.id, correctOpt.id, false);
    }
    await completeParticipant(part1.id);

    const part1Data = await getParticipant(part1.id);
    const stats1 = part1Data?.stats;
    assert(
      stats1 &&
      stats1.total_questions === 5 &&
      stats1.correct_count === 5 &&
      stats1.incorrect_count === 0 &&
      stats1.unanswered_count === 0 &&
      stats1.accuracy === 100 &&
      part1Data.accuracy === 100 &&
      part1Data.total_correct === 5 &&
      part1Data.total_incorrect === 0 &&
      part1Data.total_unanswered === 0,
      'RT-01',
      'Semua jawaban benar menghasilkan akurasi 100% dan breakdown lengkap',
      `Score=${part1Data.score}, Acc=${stats1.accuracy}%, Benar=${stats1.correct_count}, Salah=${stats1.incorrect_count}, TidakDijawab=${stats1.unanswered_count}`
    );

    // -------------------------------------------------------------------------
    // RT-02: Semua jawaban salah -> Akurasi 0%
    // -------------------------------------------------------------------------
    console.log('\n--- RT-02: Semua Jawaban Salah (0% Akurasi) ---');
    const sess2 = await setupSession('881002', 'serius');
    const part2 = await joinParticipant(sess2.id, 'Murid_RT02_0pct');

    for (let i = 0; i < qDetails.length; i++) {
      const { question, wrongOpt } = qDetails[i];
      await submitAnswer(part2.id, sess2.id, question.id, wrongOpt.id, false);
    }
    await completeParticipant(part2.id);

    const part2Data = await getParticipant(part2.id);
    const stats2 = part2Data?.stats;
    assert(
      stats2 &&
      stats2.total_questions === 5 &&
      stats2.correct_count === 0 &&
      stats2.incorrect_count === 5 &&
      stats2.unanswered_count === 0 &&
      stats2.accuracy === 0 &&
      part2Data.total_correct === 0 &&
      part2Data.total_incorrect === 5 &&
      part2Data.total_unanswered === 0,
      'RT-02',
      'Semua jawaban salah menghasilkan akurasi 0% dan 5 jawaban salah',
      `Score=${part2Data.score}, Acc=${stats2.accuracy}%, Benar=${stats2.correct_count}, Salah=${stats2.incorrect_count}, TidakDijawab=${stats2.unanswered_count}`
    );

    // -------------------------------------------------------------------------
    // RT-03: Campuran benar dan salah (3 Benar, 2 Salah) -> Akurasi 60%
    // -------------------------------------------------------------------------
    console.log('\n--- RT-03: Campuran Jawaban Benar & Salah (60% Akurasi) ---');
    const sess3 = await setupSession('881003', 'serius');
    const part3 = await joinParticipant(sess3.id, 'Murid_RT03_Mixed');

    // Q1, Q2, Q3 correct; Q4, Q5 wrong
    for (let i = 0; i < 3; i++) {
      await submitAnswer(part3.id, sess3.id, qDetails[i].question.id, qDetails[i].correctOpt.id, false);
    }
    for (let i = 3; i < 5; i++) {
      await submitAnswer(part3.id, sess3.id, qDetails[i].question.id, qDetails[i].wrongOpt.id, false);
    }
    await completeParticipant(part3.id);

    const part3Data = await getParticipant(part3.id);
    const stats3 = part3Data?.stats;
    assert(
      stats3 &&
      stats3.total_questions === 5 &&
      stats3.correct_count === 3 &&
      stats3.incorrect_count === 2 &&
      stats3.unanswered_count === 0 &&
      stats3.accuracy === 60 &&
      stats3.correct_count + stats3.incorrect_count + stats3.unanswered_count === stats3.total_questions,
      'RT-03',
      'Campuran 3 benar 2 salah menghasilkan akurasi 60% dan jumlah memenuhi total soal',
      `Score=${part3Data.score}, Acc=${stats3.accuracy}%, Benar=${stats3.correct_count}, Salah=${stats3.incorrect_count}, TidakDijawab=${stats3.unanswered_count}`
    );

    // -------------------------------------------------------------------------
    // RT-04: Terdapat soal timeout (2 Benar, 1 Salah, 2 Timeout)
    // -------------------------------------------------------------------------
    console.log('\n--- RT-04: Soal Timeout Masuk Kategori Tidak Dijawab ---');
    const sess4 = await setupSession('881004', 'serius');
    const part4 = await joinParticipant(sess4.id, 'Murid_RT04_Timeout');

    // Q1, Q2 correct; Q3 wrong; Q4, Q5 timeout
    await submitAnswer(part4.id, sess4.id, qDetails[0].question.id, qDetails[0].correctOpt.id, false);
    await submitAnswer(part4.id, sess4.id, qDetails[1].question.id, qDetails[1].correctOpt.id, false);
    await submitAnswer(part4.id, sess4.id, qDetails[2].question.id, qDetails[2].wrongOpt.id, false);
    await submitAnswer(part4.id, sess4.id, qDetails[3].question.id, null, true);
    await submitAnswer(part4.id, sess4.id, qDetails[4].question.id, null, true);
    await completeParticipant(part4.id);

    const part4Data = await getParticipant(part4.id);
    const stats4 = part4Data?.stats;
    assert(
      stats4 &&
      stats4.total_questions === 5 &&
      stats4.correct_count === 2 &&
      stats4.incorrect_count === 1 &&
      stats4.unanswered_count === 2 &&
      stats4.accuracy === 40 &&
      stats4.correct_count + stats4.incorrect_count + stats4.unanswered_count === 5,
      'RT-04',
      'Soal timeout tidak dihitung sebagai salah melainkan diklasifikasikan sebagai Tidak Dijawab',
      `Score=${part4Data.score}, Acc=${stats4.accuracy}%, Benar=${stats4.correct_count}, Salah=${stats4.incorrect_count}, TidakDijawab=${stats4.unanswered_count}`
    );

    // -------------------------------------------------------------------------
    // RT-05: Semua soal timeout (5 Timeout) -> Akurasi 0% tanpa NaN / Infinity
    // -------------------------------------------------------------------------
    console.log('\n--- RT-05: Semua Soal Timeout (0% Akurasi, Tanpa NaN) ---');
    const sess5 = await setupSession('881005', 'serius');
    const part5 = await joinParticipant(sess5.id, 'Murid_RT05_AllTimeout');

    for (let i = 0; i < 5; i++) {
      await submitAnswer(part5.id, sess5.id, qDetails[i].question.id, null, true);
    }
    await completeParticipant(part5.id);

    const part5Data = await getParticipant(part5.id);
    const stats5 = part5Data?.stats;
    assert(
      stats5 &&
      stats5.total_questions === 5 &&
      stats5.correct_count === 0 &&
      stats5.incorrect_count === 0 &&
      stats5.unanswered_count === 5 &&
      stats5.accuracy === 0 &&
      !isNaN(stats5.accuracy) &&
      isFinite(stats5.accuracy),
      'RT-05',
      'Semua timeout: Benar=0, Salah=0, Tidak Dijawab=5, Akurasi 0% tanpa NaN',
      `Score=${part5Data.score}, Acc=${stats5.accuracy}%, Benar=${stats5.correct_count}, Salah=${stats5.incorrect_count}, TidakDijawab=${stats5.unanswered_count}`
    );

    // -------------------------------------------------------------------------
    // RT-06: Peserta dengan skor berbeda pada sesi yang sama -> Terisolasi
    // -------------------------------------------------------------------------
    console.log('\n--- RT-06: Isolasi Statistik Antar Peserta Sesi yang Sama ---');
    const sess6 = await setupSession('881006', 'serius');
    const part6A = await joinParticipant(sess6.id, 'Murid_RT06_SiswaA');
    const part6B = await joinParticipant(sess6.id, 'Murid_RT06_SiswaB');

    // Siswa A: 4 benar, 1 salah
    for (let i = 0; i < 4; i++) {
      await submitAnswer(part6A.id, sess6.id, qDetails[i].question.id, qDetails[i].correctOpt.id, false);
    }
    await submitAnswer(part6A.id, sess6.id, qDetails[4].question.id, qDetails[4].wrongOpt.id, false);
    await completeParticipant(part6A.id);

    // Siswa B: 1 benar, 4 salah
    await submitAnswer(part6B.id, sess6.id, qDetails[0].question.id, qDetails[0].correctOpt.id, false);
    for (let i = 1; i < 5; i++) {
      await submitAnswer(part6B.id, sess6.id, qDetails[i].question.id, qDetails[i].wrongOpt.id, false);
    }
    await completeParticipant(part6B.id);

    const part6AData = await getParticipant(part6A.id);
    const part6BData = await getParticipant(part6B.id);

    assert(
      part6AData.stats.accuracy === 80 &&
      part6AData.stats.correct_count === 4 &&
      part6AData.stats.incorrect_count === 1 &&
      part6BData.stats.accuracy === 20 &&
      part6BData.stats.correct_count === 1 &&
      part6BData.stats.incorrect_count === 4,
      'RT-06',
      'Statistik kedua siswa terisolasi secara independen tanpa saling mencemari data',
      `Siswa A: Acc=${part6AData.stats.accuracy}%, Benar=${part6AData.stats.correct_count} | Siswa B: Acc=${part6BData.stats.accuracy}%, Benar=${part6BData.stats.correct_count}`
    );

    // -------------------------------------------------------------------------
    // RT-07: Refresh / Re-query Participant -> Nilai Konsisten
    // -------------------------------------------------------------------------
    console.log('\n--- RT-07: Konsistensi Statistik Pasca Refresh/Re-query ---');
    const query1 = await getParticipant(part3.id);
    const query2 = await getParticipant(part3.id);
    const queryDetails = (await apiCall('GET', `/api/participants/index.php?id=${part3.id}&with_quiz=true`)).body?.data;

    assert(
      query1.stats.accuracy === query2.stats.accuracy &&
      query1.stats.correct_count === queryDetails.stats.correct_count &&
      query1.stats.incorrect_count === queryDetails.stats.incorrect_count &&
      query1.stats.unanswered_count === queryDetails.stats.unanswered_count,
      'RT-07',
      'Nilai statistik konsisten identik saat re-query melalui endpoint standar maupun with_quiz',
      `Query 1 Acc=${query1.stats.accuracy}%, Query 2 Acc=${query2.stats.accuracy}%, Details Acc=${queryDetails.stats.accuracy}%`
    );

    // -------------------------------------------------------------------------
    // RT-08: Mode Serius vs Mode Santai
    // -------------------------------------------------------------------------
    console.log('\n--- RT-08: Statistik pada Mode Santai (Casual) ---');
    const sess8 = await setupSession('881008', 'santai', 3);
    const part8 = await joinParticipant(sess8.id, 'Murid_RT08_CasualMode');

    // Answer 2 correct, 1 wrong (lives drop to 2), 2 correct
    await submitAnswer(part8.id, sess8.id, qDetails[0].question.id, qDetails[0].correctOpt.id, false);
    await submitAnswer(part8.id, sess8.id, qDetails[1].question.id, qDetails[1].correctOpt.id, false);
    await submitAnswer(part8.id, sess8.id, qDetails[2].question.id, qDetails[2].wrongOpt.id, false);
    await apiCall('PUT', `/api/participants/index.php?id=${part8.id}`, null, { lives: 2 });
    await submitAnswer(part8.id, sess8.id, qDetails[3].question.id, qDetails[3].correctOpt.id, false);
    await submitAnswer(part8.id, sess8.id, qDetails[4].question.id, qDetails[4].correctOpt.id, false);
    await completeParticipant(part8.id);

    const part8Data = await getParticipant(part8.id);
    assert(
      part8Data.stats &&
      part8Data.stats.total_questions === 5 &&
      part8Data.stats.correct_count === 4 &&
      part8Data.stats.incorrect_count === 1 &&
      part8Data.stats.unanswered_count === 0 &&
      part8Data.stats.accuracy === 80 &&
      part8Data.lives === 2,
      'RT-08',
      'Mode santai mencatat statistik akurasi 80% (4 benar, 1 salah) dan mempertahankan sisa nyawa',
      `Lives=${part8Data.lives}, Acc=${part8Data.stats.accuracy}%, Benar=${part8Data.stats.correct_count}, Salah=${part8Data.stats.incorrect_count}`
    );

    console.log('\n========================================================================');
    console.log(` SUMMARY: ${passed} PASSED / ${failed} FAILED (Total ${passed + failed})`);
    console.log('========================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error running regression suite:', err);
    process.exit(1);
  }
}

runAccuracySuite();
