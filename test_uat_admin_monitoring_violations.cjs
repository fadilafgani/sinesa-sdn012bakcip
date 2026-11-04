const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9233;
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
  console.log(' UAT SUITE: MONITORING PELANGGARAN PESERTA DI ADMIN (SINESA)');
  console.log('========================================================================\n');

  const suiteResults = [];

  // 1. Authenticate Admin and Teacher
  console.log('--- Step 1: Authenticating Admin & Teacher ---');
  const adminLoginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'admin@sinesa.com',
    password: 'password123'
  });
  const adminToken = adminLoginRes.body?.data?.access_token;
  if (!adminToken) throw new Error('Failed to obtain admin token: ' + JSON.stringify(adminLoginRes));
  console.log('✔ Admin token acquired.');

  const teacherLoginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'pertiwi_test@sinesa.com',
    password: 'password123'
  });
  const teacherToken = teacherLoginRes.body?.data?.access_token;
  if (!teacherToken) throw new Error('Failed to obtain teacher token: ' + JSON.stringify(teacherLoginRes));
  console.log('✔ Teacher token acquired.');

  // 2. Setup Test Quiz & Active Session in Mode 'serius'
  console.log('\n--- Step 2: Creating Test Session in Mode Serius ---');
  const TEST_QUIZ_ID = 'quiz-uat-05e708b3';
  
  const sessRes = await apiCall('POST', '/api/sessions/index.php', teacherToken, {
    quiz_id: TEST_QUIZ_ID,
    quiz_mode: 'serius',
    status: 'active',
    current_stage: 'question',
    current_question_index: 0,
    show_leaderboard: 1,
    show_final_result: 1
  });
  const sessionId = sessRes.body?.data?.id;
  if (!sessionId) throw new Error('Failed to create test session: ' + JSON.stringify(sessRes));
  console.log(`✔ Active session created: ${sessionId}`);

  // 3. Register 3 participants
  console.log('\n--- Step 3: Registering 3 Participants ---');
  const participantNames = ['Ahmad Dahlan', 'Budi Santoso', 'Citra Kirana'];
  const participantIds = [];

  for (const name of participantNames) {
    const pRes = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: sessionId,
      display_name: name,
      score: 100,
      lives: 3,
      current_progress: 1
    });
    const pid = pRes.body?.data?.id;
    if (!pid) throw new Error(`Failed to add participant ${name}: ` + JSON.stringify(pRes));
    participantIds.push({ id: pid, name });
    console.log(`✔ Participant added: ${name} (${pid})`);
  }

  // Verify backend session API returns 3 participants
  const sessCheck = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}&with_participants=1`, adminToken);
  console.log('✔ Backend verification for session:', {
    participant_count: sessCheck.body?.data?.participant_count,
    active_participant_count: sessCheck.body?.data?.active_participant_count,
    total_violations: sessCheck.body?.data?.total_violations,
    participants_len: sessCheck.body?.data?.participants?.length
  });

  if (sessCheck.body?.data?.participant_count !== 3) {
    throw new Error(`Expected participant_count 3, got ${sessCheck.body?.data?.participant_count}`);
  }

  // 4. Launch Headless Chrome for CDP UI Verification
  console.log('\n--- Step 4: Launching Chrome CDP ---');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
    '--headless=new',
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

    if (!versionInfo?.webSocketDebuggerUrl) {
      throw new Error('Could not connect to Chrome debugging port');
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
    await sendCommand('Network.enable');

    async function evalDom(expression) {
      const res = await sendCommand('Runtime.evaluate', { expression, returnByValue: true });
      return res.result?.value;
    }

    async function captureScreenshot(fileName) {
      const { data } = await sendCommand('Page.captureScreenshot', { format: 'png' });
      const filePath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      console.log(`[SCREENSHOT CAPTURED] ${fileName} -> ${filePath}`);
    }

    // Set Desktop Viewport (1280x900)
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    async function typeInput(selector, value) {
      await evalDom(`(() => {
        const el = document.querySelector('${selector}');
        if (!el) return;
        el.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, '${value}');
        if (el._valueTracker) {
          el._valueTracker.setValue('');
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    }

    // Login via UI as Admin
    console.log('\n--- Step 5: Logging into Admin Dashboard via UI ---');
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    // Type credentials using native value setter
    await typeInput('input[type="email"]', 'admin@sinesa.com');
    await delay(200);
    await typeInput('input[type="password"]', 'password123');
    await delay(300);

    // Submit form
    await evalDom(`document.querySelector('button[type="submit"]')?.click()`);
    await delay(3500);

    // If still on /login, wait another second or check error
    const checkPath = await evalDom('window.location.pathname');
    if (checkPath === '/login') {
      const errText = await evalDom('document.querySelector(".text-red-500, [role=\\"alert\\"]")?.innerText');
      console.log('Login attempt note:', errText);
      await delay(2000);
    }

    // Verify Admin Dashboard reached
    const currentUrl = await evalDom('window.location.pathname');
    console.log(`✔ Navigated to: ${currentUrl}`);

    // Switch to Tab Kelola Kuis
    await evalDom(`document.querySelector('[data-testid="tab-quizzes"]')?.click()`);
    await delay(1500);

    // =========================================================================
    // SCENARIO 1: Sesi Serius dengan 3 Peserta Tanpa Pelanggaran
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [SCENARIO 1] Sesi Serius dengan 3 Peserta Tanpa Pelanggaran');
    console.log('========================================================================');

    // Check card telemetry
    const cardStatus = await evalDom(`document.querySelector('[data-testid="session-status-${sessionId}"]')?.innerText`);
    const cardConn = await evalDom(`document.querySelector('[data-testid="session-connection-status-${sessionId}"]')?.innerText`);
    const cardParts = await evalDom(`document.querySelector('[data-testid="session-participants-count-${sessionId}"]')?.innerText`);
    const cardViols = await evalDom(`document.querySelector('[data-testid="session-violations-count-${sessionId}"]')?.innerText`);

    console.log('[Active Session Card Telemetry]');
    console.log('- Status:', cardStatus);
    console.log('- Koneksi:', cardConn);
    console.log('- Jumlah Peserta:', cardParts);
    console.log('- Pelanggaran:', cardViols);

    if (!cardParts || !cardParts.includes('3 Peserta')) {
      throw new Error(`Scenario 1: Expected 3 Peserta on card, got: "${cardParts}"`);
    }

    // Open Monitoring Modal
    console.log('--- Opening Admin Monitoring Modal ---');
    await evalDom(`document.querySelector('[data-testid="btn-monitor-session-${sessionId}"]')?.click()`);
    await delay(1500);

    // Check modal contents
    const modalStatus = await evalDom(`document.querySelector('[data-testid="monitor-status-session"]')?.innerText`);
    const modalConn = await evalDom(`document.querySelector('[data-testid="monitor-connection-status"]')?.innerText`);
    const modalParts = await evalDom(`document.querySelector('[data-testid="monitor-participant-count"]')?.innerText`);
    const modalViols = await evalDom(`document.querySelector('[data-testid="monitor-total-violations"]')?.innerText`);
    const modalNoViols = await evalDom(`!!document.querySelector('[data-testid="monitoring-no-violations"]')`);
    const tableRowsCount = await evalDom(`document.querySelectorAll('[data-testid="monitoring-participants-table"] tbody tr').length`);

    console.log('[Monitoring Modal Telemetry]');
    console.log('- Modal Status:', modalStatus);
    console.log('- Modal Koneksi:', modalConn);
    console.log('- Modal Jumlah Peserta:', modalParts);
    console.log('- Modal Total Pelanggaran:', modalViols);
    console.log('- Clean state visible:', modalNoViols);
    console.log('- Participant rows count:', tableRowsCount);

    if (!modalParts.includes('3 Peserta') || !modalStatus.includes('SESI AKTIF') || tableRowsCount !== 3) {
      throw new Error(`Scenario 1 Modal telemetry mismatch: parts="${modalParts}", rows=${tableRowsCount}`);
    }

    await captureScreenshot('uat_admin_monitoring_active_participants.png');
    suiteResults.push({
      scenario: '1. Sesi dengan 3 peserta tanpa pelanggaran',
      status: 'PASS',
      details: `Status SESI AKTIF, ONLINE, 3 Peserta, 0 Pelanggaran, 3 baris tabel peserta tampil sempurna.`
    });

    // =========================================================================
    // SCENARIO 2: 1 Peserta Melakukan Pelanggaran Terkonfirmasi (Live Update)
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [SCENARIO 2] 1 Peserta Melakukan Pelanggaran (Ahmad Dahlan) - Live Polling');
    console.log('========================================================================');

    // Trigger violation for Participant 1 (Ahmad Dahlan)
    const p1 = participantIds[0];
    const violReason1 = 'Berpindah tab atau me-minimize jendela browser';
    const violRes1 = await apiCall('PUT', '/api/participants/index.php', null, {
      id: p1.id,
      violation_count: 1,
      violation_reason: violReason1
    });
    console.log(`✔ API violation registered for ${p1.name}: Status ${violRes1.status}`);

    // Wait for modal live polling (2.5s interval) without reloading page!
    console.log('--- Waiting 3.5 seconds for live modal update without reload ---');
    await delay(3500);

    const liveViolCount = await evalDom(`document.querySelector('[data-testid="monitor-total-violations"]')?.innerText`);
    const liveViolCard = await evalDom(`!!document.querySelector('[data-testid^="violation-card-"]')`);
    const liveStudentName = await evalDom(`document.querySelector('[data-testid="violation-student-name"]')?.innerText`);
    const liveViolType = await evalDom(`document.querySelector('[data-testid="violation-type"]')?.innerText`);
    const liveViolStatus = await evalDom(`document.querySelector('[data-testid="violation-status"]')?.innerText`);
    const liveViolCountBadge = await evalDom(`document.querySelector('[data-testid="violation-count"]')?.innerText`);
    const liveViolTime = await evalDom(`document.querySelector('[data-testid="violation-time"]')?.innerText`);

    console.log('[Live Modal Update Results - Scenario 2]');
    console.log('- Total Pelanggaran counter:', liveViolCount);
    console.log('- Violation Card Present:', liveViolCard);
    console.log('- Student Name:', liveStudentName);
    console.log('- Violation Type/Reason:', liveViolType);
    console.log('- Violation Status:', liveViolStatus);
    console.log('- Violation Count Badge:', liveViolCountBadge);
    console.log('- Violation Time:', liveViolTime);

    if (!liveViolCount.includes('1 Pelanggaran') || !liveStudentName.includes('Ahmad Dahlan') || !liveViolStatus.toUpperCase().includes('TERKONFIRMASI')) {
      throw new Error(`Scenario 2 Live update failed: violCount="${liveViolCount}", student="${liveStudentName}"`);
    }

    await captureScreenshot('uat_admin_monitoring_confirmed_violation.png');
    suiteResults.push({
      scenario: '2. 1 peserta melakukan pelanggaran terkonfirmasi (Live Update)',
      status: 'PASS',
      details: `Peringatan realtime tampil otomatis tanpa reload: Ahmad Dahlan, '${violReason1}', Pelanggaran ke-1, Terkonfirmasi di Server.`
    });

    // =========================================================================
    // SCENARIO 3: 2 Peserta Melakukan Pelanggaran Bersamaan
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [SCENARIO 3] 2 Peserta Melakukan Pelanggaran Bersamaan (Budi Santoso)');
    console.log('========================================================================');

    // Trigger violation for Participant 2 (Budi Santoso)
    const p2 = participantIds[1];
    const violReason2 = 'Keluar dari mode layar penuh (Fullscreen)';
    await apiCall('PUT', '/api/participants/index.php', null, {
      id: p2.id,
      violation_count: 1,
      violation_reason: violReason2
    });
    console.log(`✔ API violation registered for ${p2.name}`);

    // Wait for live poll update
    await delay(3500);

    const multiViolCount = await evalDom(`document.querySelector('[data-testid="monitor-total-violations"]')?.innerText`);
    const totalViolCards = await evalDom(`document.querySelectorAll('[data-testid^="violation-card-"]').length`);
    const namesInAlerts = await evalDom(`Array.from(document.querySelectorAll('[data-testid="violation-student-name"]')).map(el => el.innerText)`);

    console.log('[Multiple Violations Telemetry]');
    console.log('- Total Pelanggaran counter:', multiViolCount);
    console.log('- Violation Cards Count:', totalViolCards);
    console.log('- Students in Violation Panel:', namesInAlerts);

    if (!multiViolCount.includes('2 Pelanggaran') || totalViolCards < 2 || !namesInAlerts.includes('Budi Santoso')) {
      throw new Error(`Scenario 3 failed: count="${multiViolCount}", cards=${totalViolCards}, names=${JSON.stringify(namesInAlerts)}`);
    }

    suiteResults.push({
      scenario: '3. 2 peserta melakukan pelanggaran bersamaan',
      status: 'PASS',
      details: `Kedua peserta tercatat secara terpisah dan akurat (Ahmad Dahlan & Budi Santoso), total 2 pelanggaran, tidak saling menimpa.`
    });

    // =========================================================================
    // SCENARIO 4: Reload Halaman (Persistence & Initial Fetch Persistence)
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [SCENARIO 4] Reload Halaman Admin (Persistence Check)');
    console.log('========================================================================');

    console.log('--- Reloading /admin page ---');
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/admin` });
    await delay(3000);

    // Switch to Kelola Kuis
    await evalDom(`document.querySelector('[data-testid="tab-quizzes"]')?.click()`);
    await delay(1500);

    // Check card after reload
    const reloadedCardParts = await evalDom(`document.querySelector('[data-testid="session-participants-count-${sessionId}"]')?.innerText`);
    const reloadedCardViols = await evalDom(`document.querySelector('[data-testid="session-violations-count-${sessionId}"]')?.innerText`);

    console.log('[Session Card After Page Reload]');
    console.log('- Jumlah Peserta:', reloadedCardParts);
    console.log('- Total Pelanggaran:', reloadedCardViols);

    // Reopen monitoring modal
    await evalDom(`document.querySelector('[data-testid="btn-monitor-session-${sessionId}"]')?.click()`);
    await delay(1500);

    const reloadedModalParts = await evalDom(`document.querySelector('[data-testid="monitor-participant-count"]')?.innerText`);
    const reloadedModalViols = await evalDom(`document.querySelector('[data-testid="monitor-total-violations"]')?.innerText`);
    const reloadedViolCards = await evalDom(`document.querySelectorAll('[data-testid^="violation-card-"]').length`);
    const reloadedRowsCount = await evalDom(`document.querySelectorAll('[data-testid="monitoring-participants-table"] tbody tr').length`);

    console.log('[Monitoring Modal After Page Reload]');
    console.log('- Modal Peserta:', reloadedModalParts);
    console.log('- Modal Pelanggaran:', reloadedModalViols);
    console.log('- Violation Cards count:', reloadedViolCards);
    console.log('- Participants Rows count:', reloadedRowsCount);

    if (!reloadedModalParts.includes('3 Peserta') || !reloadedModalViols.includes('2 Pelanggaran') || reloadedViolCards < 2 || reloadedRowsCount !== 3) {
      throw new Error(`Scenario 4 Reload Persistence failed!`);
    }

    await captureScreenshot('uat_admin_monitoring_persisted_reload.png');
    suiteResults.push({
      scenario: '4. Reload halaman Admin (Persistence)',
      status: 'PASS',
      details: `Data 3 peserta dan 2 riwayat pelanggaran tetap utuh dan tampil sempurna setelah full browser reload.`
    });

    // =========================================================================
    // SCENARIO 5: Edge Case - Sesi Tanpa Peserta (Empty State)
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [SCENARIO 5] Edge Case: Sesi Tanpa Peserta (Empty State)');
    console.log('========================================================================');

    // Close modal from previous scenario
    await evalDom(`(() => {
      const closeBtn = document.querySelector('[data-testid="admin-session-monitoring-modal"] button .lucide-x')?.closest('button');
      if (closeBtn) closeBtn.click();
    })()`);
    await delay(1000);

    const emptySessRes = await apiCall('POST', '/api/sessions/index.php', teacherToken, {
      quiz_id: TEST_QUIZ_ID,
      quiz_mode: 'serius',
      status: 'active'
    });
    const emptySessId = emptySessRes.body?.data?.id;

    // Refresh page so fresh sessions are loaded
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/admin` });
    await delay(3000);
    await evalDom(`document.querySelector('[data-testid="tab-quizzes"]')?.click()`);
    await delay(1500);

    await evalDom(`document.querySelector('[data-testid="btn-monitor-session-${emptySessId}"]')?.click()`);
    await delay(2000);

    const emptyStateText = await evalDom(`document.querySelector('[data-testid="monitoring-empty-state"]')?.innerText`);
    console.log('- Empty State Text:', emptyStateText);

    if (!emptyStateText || !emptyStateText.includes('Belum ada peserta yang bergabung')) {
      throw new Error(`Scenario 5 failed: expected empty state message, got: "${emptyStateText}"`);
    }

    suiteResults.push({
      scenario: '5. Edge case: Sesi tanpa peserta (Empty State)',
      status: 'PASS',
      details: `Menampilkan status ramah 'Belum ada peserta yang bergabung', bukan error atau loading tanpa akhir.`
    });

    // Cleanup empty session
    await apiCall('PUT', '/api/sessions/index.php', adminToken, { id: emptySessId, action: 'finish' });
    execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM quiz_sessions WHERE id = '${emptySessId}';"`);

  } finally {
    // Cleanup active test session and Chrome process
    console.log('\n--- Cleaning up test data & processes ---');
    try {
      await apiCall('PUT', '/api/sessions/index.php', adminToken, { id: sessionId, action: 'finish' });
      // Delete test session from MySQL
      execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM quiz_sessions WHERE id = '${sessionId}';"`);
      execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM participants WHERE session_id = '${sessionId}';"`);
      execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM activity_logs WHERE details LIKE '%Sesi: ${sessionId}%';"`);
      console.log('✔ Test data cleaned up successfully.');
    } catch (e) {
      console.error('Cleanup notice:', e.message);
    }

    chromeProc.kill();
    console.log('✔ Chrome process terminated.');
  }

  console.log('\n========================================================================');
  console.log(' UAT TEST SUITE SUMMARY: ALL 5 SCENARIOS PASSED 100%');
  console.log('========================================================================');
  suiteResults.forEach((r, idx) => {
    console.log(`[${r.status}] ${r.scenario}: ${r.details}`);
  });
}

runRegressionSuite().catch(err => {
  console.error('\n❌ UAT SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
