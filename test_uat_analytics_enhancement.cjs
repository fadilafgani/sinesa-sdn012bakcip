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

// Logic mirror of the frontend analytics computation
function computeAnalyticsState(participants, questions, allOptions, activeAnswers, sessionIsDone = true) {
  // Deduplicate participants
  const seenKeys = new Set();
  const uniqueParticipants = [];
  for (const p of participants) {
    const key = p.student_id ? `student_${p.student_id}` : `part_${p.id}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueParticipants.push(p);
    }
  }

  // 1. Fitur A: Rata-rata Nilai
  const finalParticipants = uniqueParticipants.filter(p => !!p.is_completed || sessionIsDone);
  let averageScore = null;
  if (finalParticipants.length > 0) {
    const totalScore = finalParticipants.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
    const rawAvg = totalScore / finalParticipants.length;
    averageScore = Math.round(rawAvg * 10) / 10;
  }

  // 2. Fitur B: Sebaran Pilihan Jawaban per Soal
  const distributions = questions.map((q, idx) => {
    const qOptions = allOptions.filter(o => o.question_id === q.id);
    const rawQAnswers = activeAnswers.filter(a => a.question_id === q.id);

    // Deduplicate answers per participant for this question
    const participantAnswerMap = new Map();
    for (const a of rawQAnswers) {
      participantAnswerMap.set(a.participant_id, a);
    }

    const optionCounts = {};
    qOptions.forEach(opt => {
      optionCounts[opt.id] = 0;
    });

    let unansweredCount = 0;
    let totalResponses = 0;

    uniqueParticipants.forEach(p => {
      const ans = participantAnswerMap.get(p.id);
      if (!ans) {
        unansweredCount++;
        return;
      }

      if (q.question_type === 'multiple_answer') {
        const ids = ans.selected_option_ids || [];
        if (ids.length === 0) {
          unansweredCount++;
        } else {
          totalResponses++;
          ids.forEach(optId => {
            if (optionCounts[optId] !== undefined) {
              optionCounts[optId]++;
            }
          });
        }
      } else {
        const optId = ans.selected_option_id;
        if (!optId || optionCounts[optId] === undefined) {
          unansweredCount++;
        } else {
          totalResponses++;
          optionCounts[optId]++;
        }
      }
    });

    const denominator = uniqueParticipants.length;

    const mappedOptions = qOptions.map((opt, optIdx) => {
      const count = optionCounts[opt.id] || 0;
      const percentage = denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
      return {
        id: opt.id,
        label: String.fromCharCode(65 + optIdx),
        text: opt.option_text,
        isCorrect: !!opt.is_correct,
        count,
        percentage,
      };
    });

    const unansweredPercent = denominator > 0 ? Math.round((unansweredCount / denominator) * 1000) / 10 : 0;

    return {
      questionId: q.id,
      questionIndex: idx + 1,
      questionText: q.question_text,
      questionType: q.question_type || 'multiple_choice',
      totalParticipants: denominator,
      totalResponses,
      unansweredCount,
      unansweredPercent,
      options: mappedOptions,
    };
  });

  return {
    averageScore,
    validCompletedCount: finalParticipants.length,
    totalParticipants: uniqueParticipants.length,
    distributions,
  };
}

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log(' UAT TEST SUITE: Average Score & Answer Option Distribution (SINESA)');
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

    execSync('php setup_test_quiz.php');
    const quizId = 'quiz-uat-timeout-5q';

    const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, token);
    const questions = questionsRes.body?.data || [];
    const qIds = questions.map(q => q.id);

    const optionsRes = await apiCall('GET', `/api/questions/index.php?question_ids=${qIds.join(',')}&type=options`, token);
    const allOptions = optionsRes.body?.data || [];

    const qDetails = questions.map(q => {
      const opts = allOptions.filter(o => o.question_id === q.id);
      const correctOpt = opts.find(o => o.is_correct);
      const wrongOpts = opts.filter(o => !o.is_correct);
      return { question: q, options: opts, correctOpt, wrongOpts };
    });

    console.log(`Loaded test quiz: ${quizId} with ${questions.length} questions and ${allOptions.length} options.\n`);

    async function createSession(pin, mode = 'serius') {
      const res = await apiCall('POST', '/api/sessions/index.php', token, {
        quiz_id: quizId,
        pin_code: pin,
        quiz_mode: mode,
        status: 'active',
        current_stage: 'question',
      });
      return res.body?.data;
    }

    async function joinParticipant(sessionId, name) {
      const res = await apiCall('POST', '/api/participants/index.php', null, {
        session_id: sessionId,
        display_name: name,
      });
      return res.body?.data;
    }

    async function submitAnswer(participantId, questionId, optionId, isTimeout = false) {
      return await apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: participantId,
        question_id: questionId,
        selected_option_id: optionId || null,
        response_time_ms: 1000,
        is_timeout: isTimeout,
      });
    }

    async function completeParticipant(participantId, score = null) {
      const payload = { is_completed: true };
      if (score !== null) payload.score = score;
      return await apiCall('PUT', `/api/participants/index.php?id=${participantId}`, null, payload);
    }

    async function finishSession(sessionId) {
      return await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, token, {
        status: 'completed',
        current_stage: 'finished',
      });
    }

    // -------------------------------------------------------------------------
    // RT-01: Peserta memiliki skor berbeda -> Rata-rata sesuai perhitungan
    // -------------------------------------------------------------------------
    console.log('--- RT-01: Peserta Memiliki Skor Berbeda ---');
    const sess1 = await createSession('771001');
    const p1A = await joinParticipant(sess1.id, 'Siswa_RT01_A');
    const p1B = await joinParticipant(sess1.id, 'Siswa_RT01_B');
    const p1C = await joinParticipant(sess1.id, 'Siswa_RT01_C');

    await completeParticipant(p1A.id, 300);
    await completeParticipant(p1B.id, 200);
    await completeParticipant(p1C.id, 250);
    await finishSession(sess1.id);

    const parts1 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess1.id}`)).body?.data || [];
    const stats1 = computeAnalyticsState(parts1, questions, allOptions, [], true);

    // Expected: (300 + 200 + 250) / 3 = 750 / 3 = 250
    assert(
      stats1.averageScore === 250 && stats1.validCompletedCount === 3,
      'RT-01',
      'Rata-rata skor peserta [300, 200, 250] terhitung tepat 250',
      `Average=${stats1.averageScore}, Completed=${stats1.validCompletedCount}`
    );

    // -------------------------------------------------------------------------
    // RT-02: Semua peserta memiliki skor sama -> Rata-rata sama dengan skor
    // -------------------------------------------------------------------------
    console.log('\n--- RT-02: Semua Peserta Memiliki Skor Sama ---');
    const sess2 = await createSession('771002');
    const p2A = await joinParticipant(sess2.id, 'Siswa_RT02_A');
    const p2B = await joinParticipant(sess2.id, 'Siswa_RT02_B');
    const p2C = await joinParticipant(sess2.id, 'Siswa_RT02_C');

    await completeParticipant(p2A.id, 100);
    await completeParticipant(p2B.id, 100);
    await completeParticipant(p2C.id, 100);
    await finishSession(sess2.id);

    const parts2 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess2.id}`)).body?.data || [];
    const stats2 = computeAnalyticsState(parts2, questions, allOptions, [], true);

    // Expected: 100
    assert(
      stats2.averageScore === 100 && stats2.validCompletedCount === 3,
      'RT-02',
      'Semua peserta skor 100 menghasilkan rata-rata 100',
      `Average=${stats2.averageScore}, Completed=${stats2.validCompletedCount}`
    );

    // -------------------------------------------------------------------------
    // RT-03: Belum ada hasil final -> Menampilkan empty state (null / '—')
    // -------------------------------------------------------------------------
    console.log('\n--- RT-03: Belum Ada Hasil Final (Empty State / Dash) ---');
    const sess3 = await createSession('771003');
    const p3A = await joinParticipant(sess3.id, 'Siswa_RT03_InProgress');
    // Participant is still in progress, session is still active
    const parts3 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess3.id}`)).body?.data || [];
    const stats3 = computeAnalyticsState(parts3, questions, allOptions, [], false);

    assert(
      stats3.averageScore === null && stats3.validCompletedCount === 0,
      'RT-03',
      'Belum ada peserta dengan hasil final menampilkan empty state (null/—) tanpa NaN',
      `Average=${stats3.averageScore}, Completed=${stats3.validCompletedCount}`
    );

    // -------------------------------------------------------------------------
    // RT-04: Peserta tidak menjawab soal -> Masuk kategori Tidak Dijawab
    // -------------------------------------------------------------------------
    console.log('\n--- RT-04: Peserta Tidak Menjawab Soal (Kategori Tidak Dijawab) ---');
    const sess4 = await createSession('771004');
    const p4A = await joinParticipant(sess4.id, 'Siswa_RT04_Answered');
    const p4B = await joinParticipant(sess4.id, 'Siswa_RT04_Timeout');

    // p4A answers Q1
    await submitAnswer(p4A.id, qDetails[0].question.id, qDetails[0].correctOpt.id, false);
    // p4B timeout on Q1
    await submitAnswer(p4B.id, qDetails[0].question.id, null, true);

    const parts4 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess4.id}`)).body?.data || [];
    const answers4 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess4.id}`)).body?.data || [];
    const stats4 = computeAnalyticsState(parts4, questions, allOptions, answers4, false);

    const q1Dist4 = stats4.distributions[0];
    assert(
      q1Dist4.unansweredCount === 1 && q1Dist4.unansweredPercent === 50 && q1Dist4.totalResponses === 1,
      'RT-04',
      'Peserta timeout/tidak menjawab masuk kategori Tidak Dijawab secara terpisah',
      `Unanswered=${q1Dist4.unansweredCount} (${q1Dist4.unansweredPercent}%), Responses=${q1Dist4.totalResponses}/${q1Dist4.totalParticipants}`
    );

    // -------------------------------------------------------------------------
    // RT-05: Semua peserta memilih opsi yang sama -> Distribusi 100% pada opsi itu
    // -------------------------------------------------------------------------
    console.log('\n--- RT-05: Semua Peserta Memilih Opsi yang Sama (100%) ---');
    const sess5 = await createSession('771005');
    const p5A = await joinParticipant(sess5.id, 'Siswa_RT05_A');
    const p5B = await joinParticipant(sess5.id, 'Siswa_RT05_B');
    const p5C = await joinParticipant(sess5.id, 'Siswa_RT05_C');

    // All pick option 0 (Option A) on Q1
    const optA = qDetails[0].options[0];
    await submitAnswer(p5A.id, qDetails[0].question.id, optA.id, false);
    await submitAnswer(p5B.id, qDetails[0].question.id, optA.id, false);
    await submitAnswer(p5C.id, qDetails[0].question.id, optA.id, false);

    const parts5 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess5.id}`)).body?.data || [];
    const answers5 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess5.id}`)).body?.data || [];
    const stats5 = computeAnalyticsState(parts5, questions, allOptions, answers5, false);

    const q1Dist5 = stats5.distributions[0];
    const optADist5 = q1Dist5.options.find(o => o.id === optA.id);
    const otherOpts5 = q1Dist5.options.filter(o => o.id !== optA.id);

    assert(
      optADist5 && optADist5.count === 3 && optADist5.percentage === 100 &&
      otherOpts5.every(o => o.count === 0 && o.percentage === 0) &&
      q1Dist5.unansweredCount === 0,
      'RT-05',
      'Semua peserta memilih opsi A menghasilkan 100% pada opsi A dan 0% pada opsi lain',
      `Opsi A count=${optADist5.count} (${optADist5.percentage}%), Unanswered=${q1Dist5.unansweredCount}`
    );

    // -------------------------------------------------------------------------
    // RT-06: Pilihan peserta tersebar -> Jumlah dan persentase akurat
    // -------------------------------------------------------------------------
    console.log('\n--- RT-06: Pilihan Peserta Tersebar (20 Peserta Contoh Proporsional) ---');
    const sess6 = await createSession('771006');
    // Create 4 participants: 2 pick A (50%), 1 picks B (25%), 1 picks C (25%), D=0 (0%)
    const p6A = await joinParticipant(sess6.id, 'Siswa_RT06_1');
    const p6B = await joinParticipant(sess6.id, 'Siswa_RT06_2');
    const p6C = await joinParticipant(sess6.id, 'Siswa_RT06_3');
    const p6D = await joinParticipant(sess6.id, 'Siswa_RT06_4');

    const optsQ1 = qDetails[0].options;
    await submitAnswer(p6A.id, qDetails[0].question.id, optsQ1[0].id, false);
    await submitAnswer(p6B.id, qDetails[0].question.id, optsQ1[0].id, false);
    await submitAnswer(p6C.id, qDetails[0].question.id, optsQ1[1].id, false);
    await submitAnswer(p6D.id, qDetails[0].question.id, optsQ1[2].id, false);

    const parts6 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess6.id}`)).body?.data || [];
    const answers6 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess6.id}`)).body?.data || [];
    const stats6 = computeAnalyticsState(parts6, questions, allOptions, answers6, false);

    const q1Dist6 = stats6.distributions[0];
    const aOpt = q1Dist6.options[0];
    const bOpt = q1Dist6.options[1];
    const cOpt = q1Dist6.options[2];
    const dOpt = q1Dist6.options[3];

    assert(
      aOpt.count === 2 && aOpt.percentage === 50 &&
      bOpt.count === 1 && bOpt.percentage === 25 &&
      cOpt.count === 1 && cOpt.percentage === 25 &&
      dOpt.count === 0 && dOpt.percentage === 0,
      'RT-06',
      'Sebaran pilihan: A=50% (2), B=25% (1), C=25% (1), D=0% (0) terhitung akurat',
      `A=${aOpt.count} (${aOpt.percentage}%), B=${bOpt.count} (${bOpt.percentage}%), C=${cOpt.count} (${cOpt.percentage}%), D=${dOpt.count} (${dOpt.percentage}%)`
    );

    // -------------------------------------------------------------------------
    // RT-07: Soal memiliki opsi berbeda -> Distribusi mengikuti opsi aktual
    // -------------------------------------------------------------------------
    console.log('\n--- RT-07: Soal Memiliki Opsi Berbeda (Dinamis Sesuai Database) ---');
    // Verify each question has exactly its actual option count from DB
    let allQuestionsMatchOptions = true;
    for (const qd of qDetails) {
      const qDist = stats6.distributions.find(d => d.questionId === qd.question.id);
      if (!qDist || qDist.options.length !== qd.options.length) {
        allQuestionsMatchOptions = false;
        break;
      }
    }
    assert(
      allQuestionsMatchOptions && stats6.distributions.length === questions.length,
      'RT-07',
      'Distribusi opsi mengikuti struktur opsi aktual tanpa mengasumsikan selalu 4 opsi',
      `Questions count=${stats6.distributions.length}, Options count per question matches DB`
    );

    // -------------------------------------------------------------------------
    // RT-08: Kuis memiliki banyak peserta -> Tidak terjadi duplikasi agregasi
    // -------------------------------------------------------------------------
    console.log('\n--- RT-08: Kuis dengan Banyak Peserta (Bebas Duplikasi) ---');
    const sess8 = await createSession('771008');
    const participantsList = [];
    for (let i = 1; i <= 10; i++) {
      const p = await joinParticipant(sess8.id, `Siswa_Banyak_${i}`);
      participantsList.push(p);
      await submitAnswer(p.id, qDetails[0].question.id, qDetails[0].correctOpt.id, false);
      await completeParticipant(p.id, 100);
    }
    await finishSession(sess8.id);

    const parts8 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess8.id}`)).body?.data || [];
    const answers8 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess8.id}`)).body?.data || [];
    const stats8 = computeAnalyticsState(parts8, questions, allOptions, answers8, true);

    const q1Dist8 = stats8.distributions[0];
    const totalCountAcrossOptions = q1Dist8.options.reduce((sum, o) => sum + o.count, 0) + q1Dist8.unansweredCount;

    assert(
      stats8.totalParticipants === 10 &&
      stats8.validCompletedCount === 10 &&
      totalCountAcrossOptions === 10 &&
      stats8.averageScore === 100,
      'RT-08',
      '10 peserta diagregasi tepat tanpa duplikasi (Total pilihan = Total peserta = 10)',
      `Total Participants=${stats8.totalParticipants}, Sum of Counts=${totalCountAcrossOptions}, Average=${stats8.averageScore}`
    );

    // -------------------------------------------------------------------------
    // RT-09: Refresh halaman analitik -> Data tetap konsisten
    // -------------------------------------------------------------------------
    console.log('\n--- RT-09: Refresh Halaman / Re-query Data Konsisten ---');
    const queryA = (await apiCall('GET', `/api/participants/index.php?session_id=${sess8.id}`)).body?.data || [];
    const queryB = (await apiCall('GET', `/api/participants/index.php?session_id=${sess8.id}`)).body?.data || [];
    const statsA = computeAnalyticsState(queryA, questions, allOptions, answers8, true);
    const statsB = computeAnalyticsState(queryB, questions, allOptions, answers8, true);

    assert(
      statsA.averageScore === statsB.averageScore &&
      statsA.totalParticipants === statsB.totalParticipants &&
      statsA.distributions[0].options[0].count === statsB.distributions[0].options[0].count,
      'RT-09',
      'Data hasil analitik konsisten identik pada setiap pemanggilan ulang',
      `Run 1 Avg=${statsA.averageScore}, Run 2 Avg=${statsB.averageScore}`
    );

    // -------------------------------------------------------------------------
    // RT-10: Membuka sesi berbeda -> Statistik tidak tercampur antar sesi
    // -------------------------------------------------------------------------
    console.log('\n--- RT-10: Isolasi Statistik Antar Sesi Kuis Berbeda ---');
    // sess1 has 3 participants with average 250
    // sess8 has 10 participants with average 100
    const partsSess1 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess1.id}`)).body?.data || [];
    const partsSess8 = (await apiCall('GET', `/api/participants/index.php?session_id=${sess8.id}`)).body?.data || [];
    const ansSess1 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess1.id}`)).body?.data || [];
    const ansSess8 = (await apiCall('GET', `/api/answers/index.php?session_id=${sess8.id}`)).body?.data || [];

    const statsSess1 = computeAnalyticsState(partsSess1, questions, allOptions, ansSess1, true);
    const statsSess8 = computeAnalyticsState(partsSess8, questions, allOptions, ansSess8, true);

    assert(
      statsSess1.totalParticipants === 3 &&
      statsSess1.averageScore === 250 &&
      statsSess8.totalParticipants === 10 &&
      statsSess8.averageScore === 100,
      'RT-10',
      'Statistik Sesi 1 (Avg: 250, N: 3) dan Sesi 2 (Avg: 100, N: 10) terisolasi sempurna',
      `Sesi 1: Avg=${statsSess1.averageScore}, N=${statsSess1.totalParticipants} | Sesi 2: Avg=${statsSess8.averageScore}, N=${statsSess8.totalParticipants}`
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

runRegressionSuite();

