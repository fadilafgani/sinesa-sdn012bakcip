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

function ensureFiveQuestionQuiz(teacherId) {
  const phpScript = `
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=sinesa_db;charset=utf8mb4', 'root', '');
    $quizId = 'quiz-uat-timeout-5q';
    $teacherId = '${teacherId}';
    
    // Check if quiz exists
    $chk = $pdo->prepare("SELECT id FROM quizzes WHERE id = :id");
    $chk->execute([':id' => $quizId]);
    if (!$chk->fetch()) {
      $pdo->prepare("
        INSERT INTO quizzes (id, teacher_id, title, description, pin_code, duration_per_question, created_at)
        VALUES (:id, :tid, 'Kuis UAT Timeout 5 Soal', 'Kuis untuk pengujian timeout dan completion status', '998877', 30, NOW())
      ")->execute([':id' => $quizId, ':tid' => $teacherId]);
    }

    // Ensure 5 questions exist
    for ($i = 1; $i <= 5; $i++) {
      $qid = "q-uat-timeout-{$i}";
      $qChk = $pdo->prepare("SELECT id FROM questions WHERE id = :id");
      $qChk->execute([':id' => $qid]);
      if (!$qChk->fetch()) {
        $pdo->prepare("
          INSERT INTO questions (id, quiz_id, question_text, question_type, points, duration, order_index)
          VALUES (:id, :qid, 'Pertanyaan Soal {$i} UAT Timeout', 'multiple_choice', 100, 30, :idx)
        ")->execute([':id' => $qid, ':qid' => $quizId, ':idx' => $i]);

        // Options
        for ($o = 1; $o <= 4; $o++) {
          $optId = "opt-uat-timeout-{$i}-{$o}";
          $isCorr = ($o === 1) ? 1 : 0;
          $pdo->prepare("
            INSERT INTO options (id, question_id, option_text, is_correct)
            VALUES (:id, :qid, 'Pilihan {$o} Soal {$i}', :corr)
          ")->execute([':id' => $optId, ':qid' => $qid, ':corr' => $isCorr]);
        }
      }
    }
  `;
  execSync(`php -r "${phpScript.replace(/\r?\n/g, ' ')}"`);
}

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log(' UAT TEST SUITE: Timeout Classification & Completed Status (Mode Serius)');
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
    // 1. Login Teacher Guru A
    const loginRes = await login('regression_teacher@sinesa.com', 'password123');
    const token = loginRes?.data?.access_token || loginRes?.data?.token;
    const teacherId = loginRes?.data?.user?.id;
    if (!token || !teacherId) {
      throw new Error('Failed to login Guru A: ' + JSON.stringify(loginRes));
    }

    // Ensure 5-question quiz exists
    execSync('php setup_test_quiz.php');

    const quizId = 'quiz-uat-timeout-5q';
    const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, token);
    const questions = questionsRes.body?.data || [];

    // Fetch options for each question
    const qDetails = [];
    for (const q of questions) {
      const optRes = await apiCall('GET', `/api/questions/index.php?type=options&question_id=${q.id}`, token);
      const opts = optRes.body?.data || [];
      const correctOpt = opts.find(o => o.is_correct);
      const wrongOpt = opts.find(o => !o.is_correct);
      qDetails.push({ question: q, options: opts, correctOpt, wrongOpt });
    }

    console.log(`Using Quiz: "Kuis UAT Timeout 5 Soal" (ID: ${quizId}) with ${qDetails.length} questions.\n`);

    // Helper: Create a fresh session and join participant
    async function setupSession(suffix, mode = 'serius') {
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      const createRes = await apiCall('POST', '/api/sessions/index.php', token, {
        quiz_id: quizId,
        pin_code: pin,
        quiz_mode: mode,
        lives_count: 3,
        show_correct_answer: true,
        show_final_result: true,
        show_leaderboard: true,
      });
      const session = createRes.body?.data;
      if (!session) throw new Error('Failed to create session: ' + JSON.stringify(createRes));

      // Start session to active/question stage
      await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, token, {
        status: 'active',
        current_stage: 'question',
        current_question_index: 0,
      });

      return { session, pin };
    }

    async function joinParticipant(sessionId, name) {
      const joinRes = await apiCall('POST', '/api/participants/index.php', null, {
        session_id: sessionId,
        display_name: name,
      });
      return joinRes.body?.data;
    }

    // -------------------------------------------------------------------------
    // RT-01: Semua soal dijawab benar -> Status "Benar", skor terakumulasi tepat
    // -------------------------------------------------------------------------
    console.log('--- RT-01: All Questions Answered Correctly ---');
    const { session: sess1 } = await setupSession('rt01');
    const part1 = await joinParticipant(sess1.id, 'Murid_RT01_AllCorrect');

    let expectedScore1 = 0;
    let lastSubmitRes1 = null;
    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      lastSubmitRes1 = await apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part1.id,
        question_id: item.question.id,
        selected_option_id: item.correctOpt.id,
      });
      expectedScore1 += (item.question.points || 100);
    }

    const snapPart1 = await apiCall('GET', `/api/participants/index.php?id=${part1.id}`);
    const p1Data = snapPart1.body?.data;

    assert(
      lastSubmitRes1?.body?.data?.is_correct === true && p1Data?.score === expectedScore1,
      'RT-01',
      'Semua soal dijawab benar menghasilkan is_correct=true dan skor terakumulasi tepat',
      `Score: ${p1Data?.score}/${expectedScore1}, is_completed: ${p1Data?.is_completed}`
    );
    assert(
      p1Data?.is_completed === true,
      'AC-03/RT-01',
      'Peserta menyelesaikan kuis tercatat is_completed=true setelah semua soal selesai',
      `is_completed: ${p1Data?.is_completed}`
    );

    // -------------------------------------------------------------------------
    // RT-02: Semua soal dijawab salah -> Status "Salah", skor 0
    // -------------------------------------------------------------------------
    console.log('\n--- RT-02: All Questions Answered Incorrectly ---');
    const { session: sess2 } = await setupSession('rt02');
    const part2 = await joinParticipant(sess2.id, 'Murid_RT02_AllWrong');

    let lastSubmitRes2 = null;
    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      lastSubmitRes2 = await apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part2.id,
        question_id: item.question.id,
        selected_option_id: item.wrongOpt.id,
      });
    }

    const snapPart2 = await apiCall('GET', `/api/participants/index.php?id=${part2.id}`);
    const p2Data = snapPart2.body?.data;

    assert(
      lastSubmitRes2?.body?.data?.is_correct === false && p2Data?.score === 0,
      'RT-02',
      'Semua soal dijawab salah menghasilkan is_correct=false dan skor 0',
      `Score: ${p2Data?.score}, is_completed: ${p2Data?.is_completed}`
    );
    assert(
      p2Data?.is_completed === true,
      'AC-03/RT-02',
      'Peserta tercatat is_completed=true pada akhir sesi salah semua',
      `is_completed: ${p2Data?.is_completed}`
    );

    // -------------------------------------------------------------------------
    // RT-03: 1 soal timeout, lainnya benar -> 1 "Tidak Dijawab", lainnya "Benar"
    // -------------------------------------------------------------------------
    console.log('\n--- RT-03: 1 Question Timeout, Others Correct ---');
    const { session: sess3 } = await setupSession('rt03');
    const part3 = await joinParticipant(sess3.id, 'Murid_RT03_OneTimeout');

    // Q0: correct, Q1: timeout, Q2..N: correct
    let expectedScore3 = 0;
    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      if (i === 1) {
        // Timeout!
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part3.id,
          question_id: item.question.id,
          is_timeout: true,
        });
      } else {
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part3.id,
          question_id: item.question.id,
          selected_option_id: item.correctOpt.id,
        });
        expectedScore3 += (item.question.points || 100);
      }
    }

    const snapPart3 = await apiCall('GET', `/api/participants/index.php?id=${part3.id}`);
    const p3Data = snapPart3.body?.data;
    const timeoutQId3 = qDetails[1].question.id;

    // Check answers table: should NOT have record for timeout question
    const ansList3Res = await apiCall('GET', `/api/answers/index.php?participant_id=${part3.id}`);
    const ansList3 = ansList3Res.body?.data || [];
    const hasTimeoutInAnswersTable3 = ansList3.some(a => a.question_id === timeoutQId3);

    assert(
      p3Data?.question_status[timeoutQId3] === 'skipped' &&
      p3Data?.skipped_questions.includes(timeoutQId3) &&
      p3Data?.score === expectedScore3,
      'RT-03',
      '1 Soal timeout tercatat sebagai skipped/Tidak Dijawab, skor hanya dari soal benar',
      `Q1 status: ${p3Data?.question_status[timeoutQId3]}, Score: ${p3Data?.score}/${expectedScore3}`
    );
    assert(
      !hasTimeoutInAnswersTable3,
      'AC-02/RT-03',
      'Soal timeout TIDAK dimasukkan ke tabel answers sebagai baris is_correct=0',
      `answers rows count: ${ansList3.length} (expected: ${qDetails.length - 1})`
    );

    // -------------------------------------------------------------------------
    // RT-04: 2 soal timeout -> Keduanya "Tidak Dijawab", bukan salah
    // -------------------------------------------------------------------------
    console.log('\n--- RT-04: 2 Questions Timeout ---');
    const { session: sess4 } = await setupSession('rt04');
    const part4 = await joinParticipant(sess4.id, 'Murid_RT04_TwoTimeouts');

    const timeoutIdxs = [0, 2];
    let expectedScore4 = 0;
    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      if (timeoutIdxs.includes(i)) {
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part4.id,
          question_id: item.question.id,
          is_timeout: true,
        });
      } else {
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part4.id,
          question_id: item.question.id,
          selected_option_id: item.correctOpt.id,
        });
        expectedScore4 += (item.question.points || 100);
      }
    }

    const snapPart4 = await apiCall('GET', `/api/participants/index.php?id=${part4.id}`);
    const p4Data = snapPart4.body?.data;
    const q0Id = qDetails[0].question.id;
    const q2Id = qDetails[2].question.id;

    assert(
      p4Data?.question_status[q0Id] === 'skipped' &&
      p4Data?.question_status[q2Id] === 'skipped' &&
      p4Data?.skipped_questions.includes(q0Id) &&
      p4Data?.skipped_questions.includes(q2Id),
      'RT-04',
      'Kedua soal timeout berstatus "skipped" (Tidak Dijawab), bukan "answered" atau salah',
      `Q0 status: ${p4Data?.question_status[q0Id]}, Q2 status: ${p4Data?.question_status[q2Id]}`
    );
    assert(
      p4Data?.score === expectedScore4,
      'AC-05/RT-04',
      'Skor akhir akurat tanpa poin untuk 2 soal timeout',
      `Score: ${p4Data?.score}/${expectedScore4}`
    );

    // -------------------------------------------------------------------------
    // RT-05: Soal selang-seling (benar, timeout, salah, timeout, benar)
    // -------------------------------------------------------------------------
    console.log('\n--- RT-05: Alternating Answers (Correct, Timeout, Wrong, Timeout, Correct) ---');
    const { session: sess5 } = await setupSession('rt05');
    const part5 = await joinParticipant(sess5.id, 'Murid_RT05_Alternating');

    let expectedScore5 = 0;
    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      if (i % 2 === 1) {
        // Timeout on odd indexes (1, 3)
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part5.id,
          question_id: item.question.id,
          is_timeout: true,
        });
      } else if (i === 2) {
        // Wrong answer on index 2
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part5.id,
          question_id: item.question.id,
          selected_option_id: item.wrongOpt.id,
        });
      } else {
        // Correct answer on index 0, 4
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part5.id,
          question_id: item.question.id,
          selected_option_id: item.correctOpt.id,
        });
        expectedScore5 += (item.question.points || 100);
      }
    }

    const snapPart5 = await apiCall('GET', `/api/participants/index.php?id=${part5.id}`);
    const p5Data = snapPart5.body?.data;

    const q0_st = p5Data?.question_status[qDetails[0].question.id];
    const q1_st = p5Data?.question_status[qDetails[1].question.id];
    const q2_st = p5Data?.question_status[qDetails[2].question.id];
    const q3_st = p5Data?.question_status[qDetails[3].question.id];
    const q4_st = p5Data?.question_status[qDetails[4].question.id];

    assert(
      q0_st === 'answered' && q1_st === 'skipped' && q2_st === 'answered' && q3_st === 'skipped' && q4_st === 'answered' && p5Data?.score === expectedScore5,
      'RT-05',
      'Selang-seling status tercatat tepat tanpa bleed-through (Q0:answered, Q1:skipped, Q2:answered, Q3:skipped, Q4:answered)',
      `Scores: ${p5Data?.score}/${expectedScore5}`
    );

    // -------------------------------------------------------------------------
    // RT-06: Semua soal timeout -> Seluruh soal "Tidak Dijawab", sesi selesai tanpa crash
    // -------------------------------------------------------------------------
    console.log('\n--- RT-06: All Questions Timeout ---');
    const { session: sess6 } = await setupSession('rt06');
    const part6 = await joinParticipant(sess6.id, 'Murid_RT06_AllTimeouts');

    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      await apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part6.id,
        question_id: item.question.id,
        is_timeout: true,
      });
    }

    const snapPart6 = await apiCall('GET', `/api/participants/index.php?id=${part6.id}`);
    const p6Data = snapPart6.body?.data;
    const ansList6Res = await apiCall('GET', `/api/answers/index.php?participant_id=${part6.id}`);
    const ansList6 = ansList6Res.body?.data || [];

    assert(
      p6Data?.score === 0 &&
      p6Data?.skipped_questions.length === qDetails.length &&
      ansList6.length === 0,
      'RT-06',
      'Semua soal timeout: seluruh soal tercatat skipped, 0 baris di answers, skor 0',
      `Skipped count: ${p6Data?.skipped_questions.length}/${qDetails.length}, Answers rows: ${ansList6.length}`
    );
    assert(
      p6Data?.is_completed === true,
      'AC-03/RT-06',
      'Semua soal timeout tetap menghasilkan is_completed=true',
      `is_completed: ${p6Data?.is_completed}`
    );

    // -------------------------------------------------------------------------
    // RT-07: Timeout pada soal terakhir -> Status completed tercatat, transisi normal
    // -------------------------------------------------------------------------
    console.log('\n--- RT-07: Timeout on Final Question ---');
    const { session: sess7 } = await setupSession('rt07');
    const part7 = await joinParticipant(sess7.id, 'Murid_RT07_FinalTimeout');

    for (let i = 0; i < qDetails.length; i++) {
      const item = qDetails[i];
      if (i === qDetails.length - 1) {
        // Final question timeout
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part7.id,
          question_id: item.question.id,
          is_timeout: true,
        });
      } else {
        await apiCall('POST', '/api/answers/submit.php', null, {
          participant_id: part7.id,
          question_id: item.question.id,
          selected_option_id: item.correctOpt.id,
        });
      }
    }

    const snapPart7 = await apiCall('GET', `/api/participants/index.php?id=${part7.id}`);
    const p7Data = snapPart7.body?.data;
    const finalQId = qDetails[qDetails.length - 1].question.id;

    assert(
      p7Data?.question_status[finalQId] === 'skipped' && p7Data?.is_completed === true,
      'RT-07',
      'Soal terakhir timeout mencatat status skipped dan is_completed=true secara otomatis',
      `Final Q: ${p7Data?.question_status[finalQId]}, is_completed: ${p7Data?.is_completed}`
    );

    // -------------------------------------------------------------------------
    // RT-08: Refresh halaman setelah timeout -> Status tetap konsisten
    // -------------------------------------------------------------------------
    console.log('\n--- RT-08: Page Refresh Simulation after Timeout ---');
    // Simulate refresh by querying participant by ID and by session ID
    const snapPart7_refreshed = await apiCall('GET', `/api/participants/index.php?id=${part7.id}`);
    const snapList7_session = await apiCall('GET', `/api/participants/index.php?session_id=${sess7.id}`);

    const p7Refreshed = snapPart7_refreshed.body?.data;
    const p7InSessionList = (snapList7_session.body?.data || []).find(p => p.id === part7.id);

    assert(
      p7Refreshed?.is_completed === true &&
      p7InSessionList?.is_completed === true &&
      p7Refreshed?.skipped_questions.includes(finalQId),
      'RT-08',
      'Refresh halaman menampilkan status Tidak Dijawab dan is_completed konsisten pada single & list API',
      `Single: is_completed=${p7Refreshed?.is_completed}, List: is_completed=${p7InSessionList?.is_completed}`
    );

    // -------------------------------------------------------------------------
    // RT-09: Race condition timeout dan submit manual -> Request kedua ditolak (409)
    // -------------------------------------------------------------------------
    console.log('\n--- RT-09: Race Condition Timeout & Manual Submit ---');
    const { session: sess9 } = await setupSession('rt09');
    const part9 = await joinParticipant(sess9.id, 'Murid_RT09_RaceCondition');
    const targetQ9 = qDetails[0];

    // Fire timeout and manual submit simultaneously
    const [resTimeout9, resManual9] = await Promise.all([
      apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part9.id,
        question_id: targetQ9.question.id,
        is_timeout: true,
      }),
      apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part9.id,
        question_id: targetQ9.question.id,
        selected_option_id: targetQ9.correctOpt.id,
      })
    ]);

    const statuses9 = [resTimeout9.status, resManual9.status];
    const has201 = statuses9.includes(201);
    const has409 = statuses9.includes(409);

    assert(
      has201 && has409,
      'RT-09',
      'Race condition: 1 request diproses (201) dan request duplikat ditolak (409 ALREADY_ANSWERED)',
      `Statuses: ${JSON.stringify(statuses9)}`
    );

    // Verify answers table has at most 1 row (no double counting)
    const ansList9Res = await apiCall('GET', `/api/answers/index.php?participant_id=${part9.id}`);
    const ansList9 = ansList9Res.body?.data || [];
    assert(
      ansList9.length <= 1,
      'AC-05/RT-09',
      'Tidak ada duplikasi jawaban atau skor ganda akibat race condition',
      `Answers rows count: ${ansList9.length}`
    );

    // -------------------------------------------------------------------------
    // RT-10: Multi-peserta timeout bersamaan -> Status independen
    // -------------------------------------------------------------------------
    console.log('\n--- RT-10: Multi-Participant Concurrent Timeout ---');
    const { session: sess10 } = await setupSession('rt10');
    const part10A = await joinParticipant(sess10.id, 'Murid_RT10_A');
    const part10B = await joinParticipant(sess10.id, 'Murid_RT10_B');
    const targetQ10 = qDetails[0];

    // Part A times out, Part B submits correct answer
    const [res10A, res10B] = await Promise.all([
      apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part10A.id,
        question_id: targetQ10.question.id,
        is_timeout: true,
      }),
      apiCall('POST', '/api/answers/submit.php', null, {
        participant_id: part10B.id,
        question_id: targetQ10.question.id,
        selected_option_id: targetQ10.correctOpt.id,
      })
    ]);

    const snap10A = (await apiCall('GET', `/api/participants/index.php?id=${part10A.id}`)).body?.data;
    const snap10B = (await apiCall('GET', `/api/participants/index.php?id=${part10B.id}`)).body?.data;

    assert(
      snap10A?.question_status[targetQ10.question.id] === 'skipped' &&
      snap10A?.score === 0 &&
      snap10B?.question_status[targetQ10.question.id] === 'answered' &&
      snap10B?.score === (targetQ10.question.points || 100),
      'RT-10',
      'Multi-peserta concurrent timeout terisolasi sempurna tanpa cross-contamination',
      `A: status=${snap10A?.question_status[targetQ10.question.id]}, score=${snap10A?.score} | B: status=${snap10B?.question_status[targetQ10.question.id]}, score=${snap10B?.score}`
    );

    // -------------------------------------------------------------------------
    // AC-06: Mode Santai -> Timeout tidak mengurangi nyawa peserta
    // -------------------------------------------------------------------------
    console.log('\n--- AC-06: Casual Mode - Timeout Does Not Deplete Lives ---');
    const { session: sessCasual } = await setupSession('casual', 'santai');
    const partCasual = await joinParticipant(sessCasual.id, 'Murid_Casual_Timeout');

    // Submit timeout
    await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: partCasual.id,
      question_id: qDetails[0].question.id,
      is_timeout: true,
    });

    const snapCasual = (await apiCall('GET', `/api/participants/index.php?id=${partCasual.id}`)).body?.data;
    assert(
      snapCasual?.lives === 3,
      'AC-06',
      'Pada mode Santai, timeout soal tidak mengurangi nyawa peserta',
      `Lives: ${snapCasual?.lives}/3`
    );

    // -------------------------------------------------------------------------
    // AC-07: Sesi kuis berpindah ke tahap selesai secara normal
    // -------------------------------------------------------------------------
    console.log('\n--- AC-07: Session Stage Finishes and Updates Participants ---');
    // Call finish on session
    await apiCall('PUT', `/api/sessions/index.php?id=${sessCasual.id}&action=finish`, token, {
      current_stage: 'finished',
      status: 'completed',
    });

    const snapCasualFinished = (await apiCall('GET', `/api/participants/index.php?id=${partCasual.id}`)).body?.data;
    assert(
      snapCasualFinished?.is_completed === true,
      'AC-07',
      'Ketika sesi berpindah ke selesai (finished), seluruh peserta diperbarui menjadi is_completed=true',
      `is_completed: ${snapCasualFinished?.is_completed}`
    );

    // Summary
    console.log('\n========================================================================');
    console.log(` TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  }
}

runRegressionSuite();
