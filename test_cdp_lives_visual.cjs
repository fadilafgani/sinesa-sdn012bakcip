const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 8000;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9222;
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
  console.log(' REAL VISUAL E2E UAT: UI Enhancement - Indikator Nyawa Kuis Habis');
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

  // 1. Authenticate Teacher Guru A & Set Up Live Session
  console.log('--- Step 0: Set Up Real Santai Session on Backend ---');
  const loginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const tokenGuruA = loginRes.body?.data?.access_token;
  assert(!!tokenGuruA, 'PRE-01', 'Teacher Guru A authenticated');

  const quizzesRes = await apiCall('GET', '/api/quizzes/index.php', tokenGuruA);
  const quizList = quizzesRes.body?.data || [];
  let testQuiz = null;
  let questions = [];

  for (const q of quizList) {
    if (q.teacher_id === loginRes.body.data.user.id) {
      const qRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${q.id}`, tokenGuruA);
      const qList = qRes.body?.data || [];
      if (qList.length >= 1) {
        testQuiz = q;
        questions = qList;
        break;
      }
    }
  }
  assert(testQuiz && questions.length > 0, 'PRE-02', `Test Quiz: "${testQuiz?.title}" (${questions.length} questions)`);

  // Terminate any previous active session
  await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
    quiz_id: testQuiz.id
  });

  // Create fresh session in 'santai' mode with 3 lives
  const sessRes = await apiCall('POST', '/api/sessions/index.php', tokenGuruA, {
    quiz_id: testQuiz.id,
    title: 'Visual UAT Santai Nyawa Session',
    status: 'lobby',
    current_stage: 'waiting',
    quiz_mode: 'santai',
    lives_count: 3,
    show_question_result: true,
    show_correct_answer: true,
    show_final_result: true
  });
  const session = sessRes.body?.data;
  const pin = testQuiz.pin_code;
  const sessionId = session?.id;
  assert(!!sessionId && !!pin, 'PRE-03', 'Fresh santai session created', `Session ID: ${sessionId}, PIN: ${pin}`);

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

    await new Promise(res => ws.onopen = res);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    async function captureScreenshot(filename) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot?.result?.data) {
        const buf = Buffer.from(shot.result.data, 'base64');
        const outPath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(outPath, buf);
        console.log(`       📸 Screenshot saved: ${filename}`);
      }
    }

    // Set Desktop Viewport
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Navigate student to play session
    console.log(`Navigating to http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Murid_Santai_Visual ...`);
    await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Murid_Santai_Visual` });
    await delay(2500);

    // Host transitions session to Question stage
    console.log('Host starts session and moves to Question stage...');
    const qStart = new Date();
    const qExpires = new Date(qStart.getTime() + 120000);
    await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, tokenGuruA, {
      status: 'active',
      current_stage: 'question',
      current_question_index: 0,
      question_started_at: qStart.toISOString(),
      question_expires_at: qExpires.toISOString()
    });

    // Wait for student frontend to receive realtime or poll update
    await delay(2000);

    // Ensure question and options are populated in useQuestionStore
    const syncRes = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { sessionActions } = await import('/src/features/session/stores/session-actions.ts');
          const { useQuestionStore } = await import('/src/features/question/stores/question-store.ts');
          const { useSessionStore } = await import('/src/features/session/stores/session-store.ts');

          await sessionActions.handleSessionUpdate('${sessionId}');

          const qState = useQuestionStore.getState();
          if (!qState.currentQuestion && qState.questions.length > 0) {
            const q = qState.questions[0];
            const optRes = await fetch('/api/questions/index.php?type=options&question_id=' + q.id);
            const optJson = await optRes.json();
            useQuestionStore.setState({
              currentQuestion: q,
              currentOptions: optJson.data || [],
              currentQuestionIndex: 0
            });
          }

          return {
            hasCurrentQuestion: !!useQuestionStore.getState().currentQuestion,
            questionsLen: useQuestionStore.getState().questions.length,
            sessionStage: useSessionStore.getState().session?.current_stage
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('DEBUG syncRes:', JSON.stringify(syncRes.result?.result?.value));
    await delay(1000);

    // 2. Test State 1: 3 Lives Remaining (❤️ ❤️ ❤️)
    console.log('\n--- Step 2: Test State 1 (3 Lives: ❤️ ❤️ ❤️) ---');
    const state3 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          if (!indicator) return { found: false, html: document.querySelector('#root')?.innerHTML.slice(0, 300) };
          const activeHearts = indicator.querySelectorAll('[data-active="true"]').length;
          const inactiveHearts = indicator.querySelectorAll('[data-active="false"]').length;
          const badge = document.querySelector('[data-testid="badge-nyawa-habis"]');
          const banner = document.querySelector('[data-testid="nyawa-habis-banner"]');
          return {
            found: true,
            lives: indicator.getAttribute('data-lives'),
            maxLives: indicator.getAttribute('data-max-lives'),
            status: indicator.getAttribute('data-status'),
            activeHearts,
            inactiveHearts,
            hasBadge: !!badge,
            hasBanner: !!banner
          };
        })()
      `,
      returnByValue: true
    });
    const s3 = state3.result?.result?.value;
    assert(s3?.found && s3.lives === '3' && s3.activeHearts === 3 && s3.inactiveHearts === 0, 'AC-01', '3 Lives UI: 3 active red hearts (❤️ ❤️ ❤️), 0 inactive', JSON.stringify(s3));
    assert(!s3.hasBadge && !s3.hasBanner, 'AC-03.a', 'No "Nyawa Habis" badge or banner when lives are healthy');
    await captureScreenshot('uat_lives_3_healthy.png');

    // 3. Test State 2: 2 Lives Remaining (❤️ ❤️ 🩶)
    console.log('\n--- Step 3: Test State 2 (2 Lives: ❤️ ❤️ 🩶) ---');
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useParticipantStore } = await import('/src/features/participant/stores/participant-store.ts');
          useParticipantStore.getState().setLives(2);
        })()
      `,
      awaitPromise: true
    });
    await delay(400);

    const state2 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          const activeHearts = indicator?.querySelectorAll('[data-active="true"]').length;
          const inactiveHearts = indicator?.querySelectorAll('[data-active="false"]').length;
          return {
            found: !!indicator,
            lives: indicator?.getAttribute('data-lives'),
            activeHearts,
            inactiveHearts
          };
        })()
      `,
      returnByValue: true
    });
    const s2 = state2.result?.result?.value;
    assert(s2?.lives === '2' && s2.activeHearts === 2 && s2.inactiveHearts === 1, 'AC-02.a', '2 Lives UI: 2 active red hearts, 1 gray heart (❤️ ❤️ 🩶)', JSON.stringify(s2));
    await captureScreenshot('uat_lives_2_remaining.png');

    // 4. Test State 3: 1 Life Remaining (❤️ 🩶 🩶)
    console.log('\n--- Step 4: Test State 3 (1 Life: ❤️ 🩶 🩶 - Critical warning) ---');
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useParticipantStore } = await import('/src/features/participant/stores/participant-store.ts');
          useParticipantStore.getState().setLives(1);
        })()
      `,
      awaitPromise: true
    });
    await delay(400);

    const state1 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          const activeHearts = indicator?.querySelectorAll('[data-active="true"]').length;
          const inactiveHearts = indicator?.querySelectorAll('[data-active="false"]').length;
          const isPulsing = indicator?.className.includes('animate-pulse');
          return {
            found: !!indicator,
            lives: indicator?.getAttribute('data-lives'),
            activeHearts,
            inactiveHearts,
            isPulsing
          };
        })()
      `,
      returnByValue: true
    });
    const s1 = state1.result?.result?.value;
    assert(s1?.lives === '1' && s1.activeHearts === 1 && s1.inactiveHearts === 2, 'AC-02.b', '1 Life UI: 1 active red heart, 2 gray hearts (❤️ 🩶 🩶)', JSON.stringify(s1));
    assert(s1?.isPulsing, 'AC-02.c', 'Critical 1-life pulse warning effect is active');
    await captureScreenshot('uat_lives_1_critical.png');

    // 5. Test State 4: 0 Lives Remaining (🩶 🩶 🩶 + Nyawa Habis Badge + Banner + Disabled Buttons)
    console.log('\n--- Step 5: Test State 4 (0 Lives: 🩶 🩶 🩶 + Nyawa Habis Badge + Banner + Disabled Buttons) ---');
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useParticipantStore } = await import('/src/features/participant/stores/participant-store.ts');
          useParticipantStore.getState().setLives(0);
        })()
      `,
      awaitPromise: true
    });
    await delay(500);

    const state0 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          const activeHearts = indicator?.querySelectorAll('[data-active="true"]').length;
          const inactiveHearts = indicator?.querySelectorAll('[data-active="false"]').length;
          const badge = document.querySelector('[data-testid="badge-nyawa-habis"]');
          const banner = document.querySelector('[data-testid="nyawa-habis-banner"]');
          const buttons = Array.from(document.querySelectorAll('.mt-6 button'));
          const allButtonsDisabled = buttons.length > 0 && buttons.every(b => b.disabled || b.classList.contains('cursor-not-allowed'));

          return {
            found: !!indicator,
            lives: indicator?.getAttribute('data-lives'),
            status: indicator?.getAttribute('data-status'),
            activeHearts,
            inactiveHearts,
            hasBadge: !!badge,
            badgeText: badge?.textContent?.trim(),
            hasBanner: !!banner,
            bannerText: banner?.textContent?.trim(),
            buttonCount: buttons.length,
            allButtonsDisabled
          };
        })()
      `,
      returnByValue: true
    });
    const s0 = state0.result?.result?.value;
    assert(s0?.lives === '0' && s0.activeHearts === 0 && s0.inactiveHearts === 3, 'AC-03.1', '0 Lives UI: 0 active, 3 gray hearts (🩶 🩶 🩶)', JSON.stringify(s0));
    assert(s0?.hasBadge && s0.badgeText === 'Nyawa Habis', 'AC-03.2', 'Danger badge "Nyawa Habis" is displayed clearly', `Badge: "${s0?.badgeText}"`);
    assert(s0?.hasBanner, 'AC-03.3', 'Prominent Nyawa Habis visual notice banner is displayed', `Banner: "${s0?.bannerText?.slice(0, 50)}..."`);
    assert(s0?.allButtonsDisabled, 'AC-03.4', 'All option buttons disabled when lives reach 0');
    await captureScreenshot('uat_lives_0_depleted.png');

    // 6. Test Responsive Layout on Mobile Viewport (width: 375px)
    console.log('\n--- Step 6: Test Mobile Viewport (375x667px) ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });
    await delay(400);

    const mobileCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          const banner = document.querySelector('[data-testid="nyawa-habis-banner"]');
          const rect = indicator?.getBoundingClientRect();
          const bannerRect = banner?.getBoundingClientRect();
          return {
            indicatorVisible: rect && rect.width > 0 && rect.height > 0 && rect.top >= 0,
            indicatorWidth: rect?.width,
            bannerVisible: bannerRect && bannerRect.width > 0 && bannerRect.height > 0,
            bannerWidth: bannerRect?.width,
            windowWidth: window.innerWidth
          };
        })()
      `,
      returnByValue: true
    });
    const mob = mobileCheck.result?.result?.value;
    assert(mob?.indicatorVisible && mob?.bannerVisible && mob.indicatorWidth < 375, 'AC-05', 'Indicator and banner perfectly fit and render on mobile viewport (width: 375px)', JSON.stringify(mob));
    await captureScreenshot('uat_lives_mobile_375px.png');

    // 7. Test Arbitrary maxLives (5 Lives Configuration)
    console.log('\n--- Step 7: Test Arbitrary maxLives (5 Lives Configuration) ---');
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const { useSessionStore } = await import('/src/features/session/stores/session-store.ts');
          const { useParticipantStore } = await import('/src/features/participant/stores/participant-store.ts');

          useSessionStore.setState((prev) => ({
            session: { ...prev.session, lives_count: 5 },
            quiz: { ...prev.quiz, lives_count: 5 }
          }));

          useParticipantStore.getState().setLives(4);
        })()
      `,
      awaitPromise: true
    });
    await delay(300);

    const max5Check = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const indicator = document.querySelector('[data-testid="lives-indicator"]');
          const totalHearts = indicator?.querySelectorAll('svg').length;
          const activeHearts = indicator?.querySelectorAll('[data-active="true"]').length;
          const inactiveHearts = indicator?.querySelectorAll('[data-active="false"]').length;
          return {
            maxLives: indicator?.getAttribute('data-max-lives'),
            totalHearts,
            activeHearts,
            inactiveHearts
          };
        })()
      `,
      returnByValue: true
    });
    const m5 = max5Check.result?.result?.value;
    assert(m5?.maxLives === '5' && m5.totalHearts === 5 && m5.activeHearts === 4 && m5.inactiveHearts === 1, 'AC-01.b', 'Dynamically adapts to maxLives = 5 (4 active hearts, 1 gray heart: ❤️ ❤️ ❤️ ❤️ 🩶)', JSON.stringify(m5));
    await captureScreenshot('uat_lives_max5_custom.png');

    // 8. Clean up session
    await apiCall('PUT', '/api/sessions/index.php?action=terminate', tokenGuruA, {
      quiz_id: testQuiz.id
    });

    console.log('\n------------------------------------------------------------------------');
    console.log(`Summary: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Fatal E2E Error:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

runVisualUat();
