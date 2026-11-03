const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 8000;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9226;
const HOST = '127.0.0.1';
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Fadil Al Afgani\\.gemini\\antigravity\\brain\\605a8e29-85a9-464f-a84d-0f7fa178f25c";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function apiCall(method, apiPath, token = null, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return await request({
    hostname: HOST,
    port: BACKEND_PORT,
    path: apiPath,
    method,
    headers
  }, payload);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function runVisualUat() {
  console.log('========================================================================');
  console.log(' REAL VISUAL E2E UAT: Timeout Feedback Popup & Review Statuses');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, code, desc, details = '') {
    if (condition) {
      console.log(`[PASS] [${code}] ${desc}`);
      if (details) console.log(`       Evidence: ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] [${code}] ${desc}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  // Ensure test quiz exists
  execSync('php setup_test_quiz.php');

  // 1. Authenticate Teacher Guru A & Set Up Live Session
  const loginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const tokenGuruA = loginRes.body?.data?.access_token;
  assert(!!tokenGuruA, 'PRE-01', 'Teacher Guru A authenticated');

  const quizId = 'quiz-uat-timeout-5q';
  const pin = '998877';

  // Terminate any previous active session
  await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
    quiz_id: quizId
  });

  // Create fresh session in 'serius' mode
  const sessRes = await apiCall('POST', '/api/sessions/index.php', tokenGuruA, {
    quiz_id: quizId,
    title: 'Visual UAT Timeout Session',
    status: 'lobby',
    current_stage: 'waiting',
    quiz_mode: 'serius',
    lives_count: 3,
    show_question_result: true,
    show_correct_answer: true,
    show_final_result: true,
    show_answer_review: true,
  });
  const session = sessRes.body?.data;
  const sessionId = session?.id;
  assert(!!sessionId, 'PRE-02', 'Fresh serious session created', `Session ID: ${sessionId}`);

  // Launch Chrome Headless
  console.log('\n--- Step 1: Launch Headless Chrome & Connect via CDP ---');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CHROME_DEBUG_PORT,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  try {
    let versionInfo = null;
    for (let i = 0; i < 20; i++) {
      try {
        versionInfo = await getJson(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version`);
        if (versionInfo && versionInfo.webSocketDebuggerUrl) break;
      } catch (e) {
        await delay(200);
      }
    }

    const pages = await getJson(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/list`);
    const page = pages.find(p => p.type === 'page' && !p.url.startsWith('chrome-extension')) || pages[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    async function captureScreenshot(filename) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot?.result?.data) {
        const buf = Buffer.from(shot.result.data, 'base64');
        const outPath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(outPath, buf);
        console.log(`       📸 Screenshot saved: ${filename}`);
      }
    }

    await new Promise(res => ws.onopen = res);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('\n--- Step 2: Navigate Student to Quiz ---');
    const playUrl = `http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Murid_Visual_Timeout`;
    await send('Page.navigate', { url: playUrl });
    await delay(2500);

    // Initialize stores with questions and active question stage
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useSessionStore } = await import('/src/features/session/stores/session-store.ts');
          const { useQuestionStore } = await import('/src/features/question/stores/question-store.ts');
          const { useParticipantStore } = await import('/src/features/participant/stores/participant-store.ts');
          const { useUiStore } = await import('/src/shared/stores/ui-store.ts');

          useUiStore.setState({ loading: false });

          const qRes = await fetch('/api/questions/index.php?quiz_id=${quizId}');
          const qJson = await qRes.json();
          const qList = qJson.data || [];
          const firstQ = qList[0];
          const optRes = await fetch('/api/questions/index.php?type=options&question_id=' + firstQ.id);
          const optJson = await optRes.json();

          useQuestionStore.setState({
            questions: qList,
            currentQuestion: firstQ,
            currentOptions: optJson.data || [],
            currentQuestionIndex: 0
          });

          useParticipantStore.setState({
            participant: {
              id: 'p-visual-test',
              session_id: '${sessionId}',
              display_name: 'Murid_Visual_Timeout',
              score: 0,
              lives: 3,
              skipped_questions: [],
              question_status: {},
              current_progress: 0,
              violation_count: 0,
              is_completed: false,
              joined_at: new Date().toISOString()
            }
          });

          useSessionStore.setState({
            session: {
              id: '${sessionId}',
              quiz_id: '${quizId}',
              status: 'active',
              current_stage: 'question',
              current_question_index: 0,
              quiz_mode: 'serius',
              show_question_result: true,
              show_correct_answer: true,
              show_final_result: true,
              show_answer_review: true,
              question_started_at: new Date().toISOString(),
              question_expires_at: new Date(Date.now() + 30000).toISOString()
            },
            quiz: {
              id: '${quizId}',
              title: 'Kuis UAT Timeout 5 Soal',
              show_question_result: true,
              show_correct_answer: true,
              show_final_result: true,
              show_answer_review: true,
              show_score_per_question: true
            }
          });
        })()
      `,
      awaitPromise: true
    });
    await delay(1000);

    console.log('\n--- Step 3: Trigger Question Timeout & Enter question_result Stage ---');
    // Student timeout
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useAnswerStore } = await import('/src/features/answer/stores/answer-store.ts');
          const { useQuestionStore } = await import('/src/features/question/stores/question-store.ts');
          const { useSessionStore } = await import('/src/features/session/stores/session-store.ts');
          const { useUiStore } = await import('/src/shared/stores/ui-store.ts');

          useUiStore.setState({ loading: false });

          let curQ = useQuestionStore.getState().currentQuestion;
          if (!curQ) {
            const qRes = await fetch('/api/questions/index.php?quiz_id=${quizId}');
            const qJson = await qRes.json();
            const qList = qJson.data || [];
            curQ = qList[0];
            const optRes = await fetch('/api/questions/index.php?type=options&question_id=' + curQ.id);
            const optJson = await optRes.json();
            useQuestionStore.setState({
              questions: qList,
              currentQuestion: curQ,
              currentOptions: optJson.data || [],
              currentQuestionIndex: 0
            });
          }

          useAnswerStore.setState({
            questionStatus: { [curQ.id]: 'skipped' },
            skippedQuestions: [curQ.id],
            hasAnswered: true,
            isAnswerCorrect: null,
            scoreAwarded: 0
          });

          useSessionStore.setState(s => ({
            session: {
              ...(s.session || {}),
              id: '${sessionId}',
              quiz_id: '${quizId}',
              status: 'active',
              current_stage: 'question_result',
              current_question_index: 0,
              quiz_mode: 'serius',
              show_question_result: true,
              show_correct_answer: true
            }
          }));
        })()
      `,
      awaitPromise: true
    });
    await delay(1500);

    // Evaluate feedback popup contents in browser
    const feedbackEval = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasTimeoutTitle = bodyText.includes('Waktu Habis (Tidak Dijawab)');
          const hasTimeoutDesc = bodyText.includes('Waktu pengerjaan telah habis sebelum Anda mengirim jawaban');
          const hasWrongAnswerTitle = bodyText.includes('Jawaban Salah!');
          return { hasTimeoutTitle, hasTimeoutDesc, hasWrongAnswerTitle, textSample: bodyText.slice(0, 500) };
        })()
      `,
      returnByValue: true
    });

    const fbData = feedbackEval.result?.result?.value;
    console.log('DEBUG fbData:', JSON.stringify(fbData));
    assert(
      fbData?.hasTimeoutTitle === true,
      'AC-01/VIS-01',
      'Feedback popup menampilkan judul "Waktu Habis (Tidak Dijawab)", BUKAN "Jawaban Salah!"',
      `Title detected: ${fbData?.hasTimeoutTitle}`
    );
    assert(
      fbData?.hasWrongAnswerTitle === false,
      'AC-01/VIS-02',
      'Feedback popup TIDAK memunculkan teks "Jawaban Salah!" pada soal timeout'
    );
    assert(
      fbData?.hasTimeoutDesc === true,
      'AC-04/VIS-03',
      'Feedback popup memuat deskripsi edukatif waktu habis tanpa penalti salah',
      `Desc detected: ${fbData?.hasTimeoutDesc}`
    );

    // Capture screenshot of feedback popup
    await captureScreenshot('uat_timeout_feedback_popup.png');

    console.log('\n--- Step 4: Render Review Screen with "Tidak Dijawab" Badges ---');
    // Move session to finished stage and trigger review screen
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useSessionStore } = await import('/src/features/session/stores/session-store.ts');
          const { useQuestionStore } = await import('/src/features/question/stores/question-store.ts');
          const { useAnswerStore } = await import('/src/features/answer/stores/answer-store.ts');

          const qs = useQuestionStore.getState().questions;
          const statusMap = {};
          const skippedList = [];
          if (qs.length >= 2) {
            statusMap[qs[0].id] = 'skipped';
            skippedList.push(qs[0].id);
            statusMap[qs[1].id] = 'skipped';
            skippedList.push(qs[1].id);
          }
          if (qs.length >= 3) {
            statusMap[qs[2].id] = 'answered';
          }

          useAnswerStore.setState({
            questionStatus: statusMap,
            skippedQuestions: skippedList,
            answersMap: qs.length >= 3 ? {
              [qs[2].id]: { id: 'ans-3', participant_id: 'p1', question_id: qs[2].id, is_correct: true, score_awarded: 100 }
            } : {},
            isCompleted: true
          });

          useSessionStore.setState(s => ({
            session: { ...(s.session || {}), current_stage: 'finished', status: 'completed' }
          }));
        })()
      `,
      awaitPromise: true
    });
    await delay(1500);

    // Click "Lihat Review Jawaban"
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.innerText.includes('Review Jawaban') || b.innerText.includes('Pembahasan'));
          if (btn) btn.click();
        })()
      `
    });
    await delay(1500);

    // Evaluate Review Badges
    const reviewEval = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const spans = Array.from(document.querySelectorAll('span'));
          const badgeTexts = spans.map(s => s.innerText.trim());
          const tidakDijawabCount = badgeTexts.filter(b => b.toUpperCase() === 'TIDAK DIJAWAB' || b.toUpperCase() === 'DILEWATI').length;
          const salahCount = badgeTexts.filter(b => b.toUpperCase() === 'SALAH').length;
          const benarCount = badgeTexts.filter(b => b.toUpperCase() === 'BENAR').length;
          return { tidakDijawabCount, salahCount, benarCount, badgeTexts: badgeTexts.filter(b => ['TIDAK DIJAWAB', 'Tidak Dijawab', 'Salah', 'SALAH', 'Benar', 'BENAR', 'DILEWATI'].includes(b)) };
        })()
      `,
      returnByValue: true
    });

    const rvData = reviewEval.result?.result?.value;
    assert(
      (rvData?.tidakDijawabCount || 0) >= 1,
      'AC-04/VIS-04',
      'Halaman Review menampilkan badge "Tidak Dijawab" (amber) untuk soal timeout',
      `Badges: ${JSON.stringify(rvData?.badgeTexts)}`
    );
    assert(
      (rvData?.salahCount || 0) === 0,
      'AC-04/VIS-05',
      'Halaman Review TIDAK menampilkan badge "Salah" pada soal yang timeout',
      `Salah count: ${rvData?.salahCount}`
    );

    // Capture screenshot of review screen
    await captureScreenshot('uat_timeout_review_screen.png');

    // Clean up session
    await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
      quiz_id: quizId
    });

    // Summary
    console.log('\n========================================================================');
    console.log(` VISUAL E2E TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    ws.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

runVisualUat();
