const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
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
  const headers = { 'Host': 'evaluasi-bakcip.test', 'Accept': 'application/json' };
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

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log(' UAT REGRESSION SUITE: HTTP 403 & ACCESS DENIED UI IN ANALYTICS');
  console.log('========================================================================\n');

  // Test setup
  const quizAId = 'quiz-uat-timeout-5q'; // Owned by Guru A (regression_teacher@sinesa.com)

  // 1. Backend Contract Verifications
  console.log('--- Step 1: Backend API Contract Verifications ---');

  // Guru A Login
  const loginGuruA = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const tokenA = loginGuruA.body?.data?.access_token;
  console.log('Guru A login status:', loginGuruA.status, 'Token acquired:', !!tokenA);

  // Guru B Login
  const loginGuruB = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'pertiwi_test@sinesa.com',
    password: 'password123'
  });
  const tokenB = loginGuruB.body?.data?.access_token;
  console.log('Guru B login status:', loginGuruB.status, 'Token acquired:', !!tokenB);

  // RT-01 (Backend): Guru A accesses own quiz
  const resOwn = await apiCall('GET', `/api/quizzes/index.php?id=${quizAId}`, tokenA);
  console.log(`[RT-01 Backend] Guru A own quiz fetch: HTTP ${resOwn.status} (Expected: 200)`);
  if (resOwn.status !== 200) throw new Error(`RT-01 Backend failed: status ${resOwn.status}`);

  // RT-02 (Backend): Guru B accesses Guru A's quiz
  const resOther = await apiCall('GET', `/api/quizzes/index.php?id=${quizAId}`, tokenB);
  console.log(`[RT-02 Backend] Guru B access Guru A quiz: HTTP ${resOther.status} (Expected: 403)`);
  console.log(`               Backend error payload: "${resOther.body?.error}"`);
  if (resOther.status !== 403) throw new Error(`RT-02 Backend failed: expected 403, got ${resOther.status}`);

  // 2. Prepare an empty quiz owned by Guru A for RT-04
  let emptyQuizId = 'quiz-uat-empty-test';
  // Create or get empty quiz
  const createEmptyRes = await apiCall('POST', '/api/quizzes/index.php', tokenA, {
    id: emptyQuizId,
    title: 'Kuis Kosong UAT Tanpa Peserta',
    description: 'Kuis khusus pengujian empty state pada analitik',
    quiz_mode: 'santai',
    duration_per_question: 30,
    show_leaderboard: true,
  });
  if (createEmptyRes.body?.data?.id) {
    emptyQuizId = createEmptyRes.body.data.id;
  }
  console.log(`Prepared empty quiz ID for RT-04: ${emptyQuizId}`);

  // Launch Chrome Headless
  console.log('\n--- Step 2: Browser E2E & Visual Verifications (CDP) ---');
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
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        callbacks.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise(res => ws.onopen = res);
    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');

    // Desktop Viewport
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    async function evalDom(expression) {
      const res = await sendCommand('Runtime.evaluate', { expression, returnByValue: true });
      return res.result?.value;
    }

    async function browserLogout() {
      await sendCommand('Network.clearBrowserCookies');
      await sendCommand('Runtime.evaluate', {
        expression: `
          localStorage.clear();
          sessionStorage.clear();
        `
      });
      await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
      await delay(2000);
    }

    // =========================================================================
    // TEST CASE RT-01: Guru A Accesses Own Quiz (HTTP 200, State: Success)
    // =========================================================================
    console.log('\n[TEST CASE RT-01] Guru A Accesses Own Quiz');
    await browserLogout();
    const loginAUrl = `http://127.0.0.1:${VITE_PORT}/login?email=regression_teacher%40sinesa.com&password=password123&role=teacher&auto_submit=true`;
    console.log(`Logging in Guru A...`);
    await sendCommand('Page.navigate', { url: loginAUrl });
    await delay(3000);

    const ownUrl = `http://127.0.0.1:${VITE_PORT}/teacher/analytics?id=${quizAId}`;
    console.log(`Navigating Guru A to own quiz: ${ownUrl}`);
    await sendCommand('Page.navigate', { url: ownUrl });
    await delay(3500);

    const hasOwnerAccessDenied = await evalDom(`!!document.querySelector('[data-testid="access-denied-container"]')`);
    const hasOwnerMetrics = await evalDom(`!!document.querySelector('[data-testid="stat-total-participants"]')`);
    const hasOwnerDistribution = await evalDom(`!!document.querySelector('[data-testid="section-answer-distribution"]')`);
    console.log(`- Owner sees access-denied-container: ${hasOwnerAccessDenied} (Expected: false)`);
    console.log(`- Owner sees metrics grid: ${hasOwnerMetrics} (Expected: true)`);
    console.log(`- Owner sees answer distributions: ${hasOwnerDistribution} (Expected: true)`);

    if (hasOwnerAccessDenied || !hasOwnerMetrics || !hasOwnerDistribution) {
      throw new Error('FAIL RT-01: Guru A could not see full analytics dashboard for own quiz!');
    }
    console.log('PASS RT-01: Guru A successfully views complete metrics for own quiz.');

    // =========================================================================
    // TEST CASE RT-04: Guru A Accesses Quiz with 0 Participants (HTTP 200, State: Empty)
    // =========================================================================
    console.log('\n[TEST CASE RT-04] Guru A Accesses Quiz with 0 Participants (State: Empty)');
    const emptyUrl = `http://127.0.0.1:${VITE_PORT}/teacher/analytics?id=${emptyQuizId}`;
    console.log(`Navigating Guru A to empty quiz: ${emptyUrl}`);
    await sendCommand('Page.navigate', { url: emptyUrl });
    await delay(3000);

    const hasEmptyContainer = await evalDom(`!!document.querySelector('[data-testid="empty-state-container"]')`);
    const hasEmptyAccessDenied = await evalDom(`!!document.querySelector('[data-testid="access-denied-container"]')`);
    const emptyBannerText = await evalDom(`document.querySelector('[data-testid="empty-state-container"]')?.innerText`);
    console.log(`- hasEmptyContainer: ${hasEmptyContainer} (Expected: true)`);
    console.log(`- hasEmptyAccessDenied: ${hasEmptyAccessDenied} (Expected: false)`);
    console.log(`- emptyBannerText includes "Belum Ada Data Peserta": ${emptyBannerText?.includes('Belum Ada Data Peserta')}`);

    if (!hasEmptyContainer || hasEmptyAccessDenied || !emptyBannerText?.includes('Belum Ada Data Peserta')) {
      throw new Error('FAIL RT-04: Empty quiz did not properly render official empty-state-container!');
    }
    console.log('PASS RT-04: Official empty state rendered, strictly differentiated from error/unauthorized states.');

    // Capture Empty State Screenshot
    const shotEmpty = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const emptyPath = path.join(ARTIFACT_DIR, 'uat_analytics_empty_state_desktop.png');
    fs.writeFileSync(emptyPath, Buffer.from(shotEmpty.data, 'base64'));
    console.log(`[SAVED] Empty state screenshot: ${emptyPath}`);

    // =========================================================================
    // TEST CASE RT-02 & RT-03: Guru B Accesses Guru A's Quiz -> HTTP 403 Access Denied
    // =========================================================================
    console.log('\n[TEST CASE RT-02 & RT-03] Guru B Accesses Guru A Quiz');
    await browserLogout();
    const loginBUrl = `http://127.0.0.1:${VITE_PORT}/login?email=pertiwi_test%40sinesa.com&password=password123&role=teacher&auto_submit=true`;
    console.log(`Logging in Guru B...`);
    await sendCommand('Page.navigate', { url: loginBUrl });
    await delay(3000);

    // Navigate to Guru A's quiz analytics
    const unauthorizedUrl = `http://127.0.0.1:${VITE_PORT}/teacher/analytics?id=${quizAId}`;
    console.log(`Navigating Guru B to: ${unauthorizedUrl}`);
    await sendCommand('Page.navigate', { url: unauthorizedUrl });
    await delay(3500);

    // Verify Access Denied Container
    const hasAccessDenied = await evalDom(`!!document.querySelector('[data-testid="access-denied-container"]')`);
    const errorTitle = await evalDom(`document.querySelector('[data-testid="error-title"]')?.innerText`);
    const errorMessage = await evalDom(`document.querySelector('[data-testid="error-message"]')?.innerText`);
    const hasBackButton = await evalDom(`!!document.querySelector('[data-testid="btn-back-dashboard"]')`);
    const badgeText = await evalDom(`Array.from(document.querySelectorAll('div')).find(el => el.innerText.trim() === 'HTTP 403') ? true : false`);

    console.log(`- hasAccessDenied: ${hasAccessDenied}`);
    console.log(`- errorTitle: "${errorTitle}"`);
    console.log(`- errorMessage: "${errorMessage}"`);
    console.log(`- hasBackButton: ${hasBackButton}`);
    console.log(`- HTTP 403 badge present: ${badgeText}`);

    if (!hasAccessDenied) throw new Error('FAIL: access-denied-container not found in DOM!');
    if (!errorTitle || !errorTitle.includes('Akses Ditolak')) throw new Error('FAIL: error title does not say "Akses Ditolak"!');
    if (!errorMessage || !errorMessage.includes('tidak memiliki izin')) throw new Error('FAIL: error message missing authorization explanation!');
    if (!hasBackButton) throw new Error('FAIL: btn-back-dashboard not found!');
    if (!badgeText) throw new Error('FAIL: HTTP 403 badge not found!');

    // RT-03: Strict check that ZERO STATS are NOT rendered in DOM
    const hasTotalParticipants = await evalDom(`!!document.querySelector('[data-testid="stat-total-participants"]')`);
    const hasAverageScore = await evalDom(`!!document.querySelector('[data-testid="stat-average-score"]')`);
    const hasAverageAccuracy = await evalDom(`!!document.querySelector('[data-testid="stat-average-accuracy"]')`);
    const hasHighestScore = await evalDom(`!!document.querySelector('[data-testid="stat-highest-score"]')`);
    const hasAnswerDistribution = await evalDom(`!!document.querySelector('[data-testid="section-answer-distribution"]')`);
    const bodyText = await evalDom(`document.body.innerText`);
    const hasZeroStudents = bodyText.includes('0 Siswa');

    console.log(`[RT-03 Zero Stats Check]`);
    console.log(`- stat-total-participants in DOM: ${hasTotalParticipants} (Expected: false)`);
    console.log(`- stat-average-score in DOM: ${hasAverageScore} (Expected: false)`);
    console.log(`- "0 Siswa" text in body: ${hasZeroStudents} (Expected: false)`);

    if (hasTotalParticipants || hasAverageScore || hasAverageAccuracy || hasHighestScore || hasAnswerDistribution || hasZeroStudents) {
      throw new Error('FAIL RT-03: Zero statistics or metrics components leaked into DOM during 403 state!');
    }
    console.log('PASS RT-02 & RT-03: Inline Access Denied UI rendered cleanly with zero statistics rendered.');

    // Capture Desktop Screenshot
    const shotDesktop = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const deskPath = path.join(ARTIFACT_DIR, 'uat_analytics_access_denied_desktop.png');
    fs.writeFileSync(deskPath, Buffer.from(shotDesktop.data, 'base64'));
    console.log(`[SAVED] Desktop 403 screenshot: ${deskPath}`);

    // Mobile Viewport Screenshot (375x812)
    console.log('Switching to mobile viewport (375x812)...');
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await delay(1000);
    const shotMobile = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const mobilePath = path.join(ARTIFACT_DIR, 'uat_analytics_access_denied_mobile_375px.png');
    fs.writeFileSync(mobilePath, Buffer.from(shotMobile.data, 'base64'));
    console.log(`[SAVED] Mobile 403 screenshot: ${mobilePath}`);

    // =========================================================================
    // TEST CASE RT-08: Refresh Page while in 403 state
    // =========================================================================
    console.log('\n[TEST CASE RT-08] Refresh Page Consistency in 403 State');
    await sendCommand('Page.reload');
    await delay(3000);
    const hasAccessDeniedAfterReload = await evalDom(`!!document.querySelector('[data-testid="access-denied-container"]')`);
    const hasZeroStatsAfterReload = await evalDom(`!!document.querySelector('[data-testid="stat-total-participants"]')`);
    console.log(`- Access Denied persistent after reload: ${hasAccessDeniedAfterReload}`);
    console.log(`- Zero stats after reload: ${hasZeroStatsAfterReload}`);
    if (!hasAccessDeniedAfterReload || hasZeroStatsAfterReload) {
      throw new Error('FAIL RT-08: Reload did not consistently maintain Access Denied state!');
    }
    console.log('PASS RT-08: Reload maintains Access Denied consistently without state corruption.');

    // Switch back to desktop
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // =========================================================================
    // TEST CASE RT-06: Non-existent Quiz ID (HTTP 404, State: Not Found)
    // =========================================================================
    console.log('\n[TEST CASE RT-06] Non-existent Quiz ID (State: Not Found)');
    const notFoundUrl = `http://127.0.0.1:${VITE_PORT}/teacher/analytics?id=quiz-id-non-existent-99999`;
    console.log(`Navigating to: ${notFoundUrl}`);
    await sendCommand('Page.navigate', { url: notFoundUrl });
    await delay(3000);

    const hasNotFoundContainer = await evalDom(`!!document.querySelector('[data-testid="not-found-container"]')`);
    const notFoundTitle = await evalDom(`document.querySelector('[data-testid="error-title"]')?.innerText`);
    const notFoundBadge = await evalDom(`Array.from(document.querySelectorAll('div')).find(el => el.innerText.trim() === 'HTTP 404') ? true : false`);
    console.log(`- hasNotFoundContainer: ${hasNotFoundContainer}`);
    console.log(`- notFoundTitle: "${notFoundTitle}"`);
    console.log(`- HTTP 404 badge present: ${notFoundBadge}`);

    if (!hasNotFoundContainer || !notFoundTitle?.includes('Tidak Ditemukan') || !notFoundBadge) {
      throw new Error('FAIL RT-06: Not Found view did not render as expected for non-existent quiz ID!');
    }
    console.log('PASS RT-06: Not Found view rendered with HTTP 404 badge.');

    // =========================================================================
    // TEST CASE RT-05: Missing Auth Token (State: Unauthorized -> Redirect)
    // =========================================================================
    console.log('\n[TEST CASE RT-05] Missing / Expired Auth Session');
    // Clear cookies & storage to simulate logged out user
    await sendCommand('Network.clearBrowserCookies');
    await sendCommand('Runtime.evaluate', {
      expression: `localStorage.clear(); sessionStorage.clear(); window.location.href = '/teacher/analytics?id=${quizAId}';`
    });
    await delay(3000);
    const currentPath = await evalDom(`window.location.pathname`);
    console.log(`- Redirect destination after unauthenticated access: "${currentPath}"`);
    if (!currentPath.includes('/login')) {
      throw new Error(`FAIL RT-05: Expected redirect to /login, but remained on ${currentPath}`);
    }
    console.log('PASS RT-05: Unauthorized access cleanly redirected to /login.');

    console.log('\n========================================================================');
    console.log(' ALL REGRESSION TESTS PASSED (RT-01 to RT-08)!');
    console.log('========================================================================\n');
  } finally {
    try { chromeProc.kill(); } catch (_) {}
  }
}

runRegressionSuite().catch(err => {
  console.error('\nRegression Suite FAILED:', err);
  process.exit(1);
});
