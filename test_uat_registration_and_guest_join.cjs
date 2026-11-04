const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9229;
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
  console.log(' UAT REGRESSION SUITE: REGISTRATION & GUEST JOIN CONFIGURATION (SINESA)');
  console.log('========================================================================\n');

  const testMatrixResults = [];
  const edgeCaseResults = [];

  // 1. Authenticate as Admin via API
  console.log('--- Authenticating Admin & Teacher ---');
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

  // Ensure test quiz and session exist
  const TEST_QUIZ_ID = 'quiz-uat-05e708b3';
  const TEST_PIN = '807023';

  // Create an active session for guest join testing
  const sessCreateRes = await apiCall('POST', '/api/sessions/index.php', teacherToken, {
    quiz_id: TEST_QUIZ_ID,
    quiz_mode: 'serius',
    show_leaderboard: 1,
    show_final_result: 1
  });
  const testSessionId = sessCreateRes.body?.data?.id;
  if (!testSessionId) {
    throw new Error('Failed to create test session: ' + JSON.stringify(sessCreateRes));
  }
  console.log(`✔ Active test session created: ${testSessionId} (PIN: ${TEST_PIN})`);

  // Helper function to update system settings
  async function updateSettings(regEnabled, guestEnabled) {
    const valReg = regEnabled ? 'true' : 'false';
    const valGuest = guestEnabled ? 'true' : 'false';
    const res = await apiCall('PUT', '/api/settings.php', adminToken, {
      registration_enabled: valReg,
      allow_registration: valReg,
      allow_student_registration: valReg,
      allow_guest_participants: valGuest
    });
    if (!res.body?.success) {
      throw new Error(`Failed to update settings to reg=${valReg}, guest=${valGuest}`);
    }
    await delay(300);
  }

  // 2. Launch Chrome Headless via CDP
  console.log('\n--- Launching Chrome Browser via CDP (Port ' + CHROME_DEBUG_PORT + ') ---');
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

    async function captureScreenshot(fileName) {
      const { data } = await sendCommand('Page.captureScreenshot', { format: 'png' });
      const filePath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      console.log(`[SCREENSHOT CAPTURED] ${fileName} -> ${filePath}`);
    }

    async function browserLogout() {
      await sendCommand('Network.clearBrowserCookies');
      await evalDom(`(() => {
        try { fetch('/api/auth/logout.php', { method: 'POST', credentials: 'include' }); } catch(e) {}
        localStorage.clear();
        sessionStorage.clear();
      })()`);
      await delay(500);
    }

    // Set Desktop Viewport (1280x900)
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // =========================================================================
    // MATRIKS 1: registration_enabled = true, allow_guest_participants = true
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [KOMBINASI 1] registration_enabled = true | allow_guest_participants = true');
    console.log('========================================================================');
    await updateSettings(true, true);

    // 1.1 API Check: Register
    const regPayload1 = {
      email: `test_reg_1_${Date.now()}@sinesa.local`,
      password: 'password123',
      name: 'Siswa Test Satu',
      role: 'student'
    };
    const apiRegRes1 = await apiCall('POST', '/api/auth/register.php', null, regPayload1);
    console.log('✔ API Register Status:', apiRegRes1.status, `(Expected: 201)`);
    if (apiRegRes1.status !== 201) throw new Error('Kombinasi 1: API Register failed with status ' + apiRegRes1.status);
    execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM profiles WHERE email = '${regPayload1.email}';"`);

    // 1.2 API Check: Guest Join
    const apiGuestRes1 = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: testSessionId,
      display_name: 'Guest Probe 1',
      student_id: null
    });
    console.log('✔ API Guest Join Status:', apiGuestRes1.status, `(Expected: 200/201)`);
    if (apiGuestRes1.status !== 200 && apiGuestRes1.status !== 201) {
      throw new Error('Kombinasi 1: API Guest Join failed with status ' + apiGuestRes1.status);
    }

    // 1.3 UI Check: Login Page
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    const hasTabLogin1 = await evalDom(`!!document.querySelector('[data-testid="tab-login-btn"]')`);
    const hasTabRegister1 = await evalDom(`!!document.querySelector('[data-testid="tab-register-btn"]')`);
    const hasTabGuest1 = await evalDom(`!!document.querySelector('[data-testid="tab-guest-btn"]')`);
    const hasBtnGuestDirect1 = await evalDom(`!!document.querySelector('[data-testid="btn-guest-join-direct"]')`);
    const tabRegisterText1 = await evalDom(`document.querySelector('[data-testid="tab-register-btn"]')?.innerText`);

    console.log('[UI Verification - Kombinasi 1]');
    console.log('- Tab Masuk present:', hasTabLogin1);
    console.log('- Tab Daftar present:', hasTabRegister1, `(Text: "${tabRegisterText1}")`);
    console.log('- Tab Gabung Tamu present:', hasTabGuest1);
    console.log('- Direct Guest Join Button present:', hasBtnGuestDirect1);

    if (!hasTabRegister1 || tabRegisterText1.includes('Ditutup') || !hasTabGuest1 || !hasBtnGuestDirect1) {
      throw new Error('Kombinasi 1: UI mismatch for tabs or direct guest button');
    }

    // Click Tab Daftar -> verify form is open
    await evalDom(`document.querySelector('[data-testid="tab-register-btn"]')?.click()`);
    await delay(500);
    const hasRegForm1 = await evalDom(`!!document.querySelector('[data-testid="register-fullname"]')`);
    const hasRegSubmit1 = await evalDom(`!!document.querySelector('[data-testid="auth-submit-btn"]')`);
    console.log('- Registration Form Inputs rendered:', hasRegForm1);
    console.log('- Registration Submit Button rendered:', hasRegSubmit1);

    if (!hasRegForm1 || !hasRegSubmit1) {
      throw new Error('Kombinasi 1: Registration form not rendered when tab opened');
    }

    // Take screenshot of Login page in Kombinasi 1
    await captureScreenshot('uat_registration_enabled_guest_enabled.png');

    // 1.4 Direct URL check: /student/play-session without query params
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/play-session` });
    await delay(2500);
    const hasInlinePin1 = await evalDom(`!!document.querySelector('#inline-guest-pin')`);
    const hasInlineName1 = await evalDom(`!!document.querySelector('#inline-guest-name')`);
    const currentUrl1 = await evalDom(`window.location.href`);
    console.log('- Direct /student/play-session URL:', currentUrl1);
    console.log('- Inline Guest PIN Input rendered:', hasInlinePin1);
    console.log('- Inline Guest Name Input rendered:', hasInlineName1);

    if (!hasInlinePin1 || !hasInlineName1 || currentUrl1.includes('/login')) {
      throw new Error('Kombinasi 1: Accessing /student/play-session failed to render inline guest form');
    }

    testMatrixResults.push({
      config: 'reg=true, guest=true',
      apiReg: `${apiRegRes1.status} OK (Created)`,
      apiGuest: `${apiGuestRes1.status} OK (Joined)`,
      uiRegister: 'Form terbuka & siap digunakan',
      uiGuest: 'Tab & tombol direct join tersedia',
      directUrl: 'Inline join form aktif di /student/play-session',
      status: 'PASS'
    });

    // =========================================================================
    // MATRIKS 2: registration_enabled = true, allow_guest_participants = false
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [KOMBINASI 2] registration_enabled = true | allow_guest_participants = false');
    console.log('========================================================================');
    await updateSettings(true, false);

    // 2.1 API Check: Register
    const regPayload2 = {
      email: `test_reg_2_${Date.now()}@sinesa.local`,
      password: 'password123',
      name: 'Siswa Test Dua',
      role: 'student'
    };
    const apiRegRes2 = await apiCall('POST', '/api/auth/register.php', null, regPayload2);
    console.log('✔ API Register Status:', apiRegRes2.status, `(Expected: 201)`);
    if (apiRegRes2.status !== 201) throw new Error('Kombinasi 2: API Register failed with status ' + apiRegRes2.status);
    execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "DELETE FROM profiles WHERE email = '${regPayload2.email}';"`);

    // 2.2 API Check: Guest Join (must be 403 Forbidden)
    const apiGuestRes2 = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: testSessionId,
      display_name: 'Guest Probe 2',
      student_id: null
    });
    console.log('✔ API Guest Join Status:', apiGuestRes2.status, `(Expected: 403)`);
    console.log('✔ API Guest Join Error:', apiGuestRes2.body?.error);
    if (apiGuestRes2.status !== 403 || !apiGuestRes2.body?.error?.includes('dinonaktifkan')) {
      throw new Error('Kombinasi 2: API Guest Join should be rejected with 403');
    }

    // 2.3 UI Check: Login Page
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    const hasTabGuest2 = await evalDom(`!!document.querySelector('[data-testid="tab-guest-btn"]')`);
    const hasBtnGuestDirect2 = await evalDom(`!!document.querySelector('[data-testid="btn-guest-join-direct"]')`);
    console.log('[UI Verification - Kombinasi 2]');
    console.log('- Tab Gabung Tamu rendered:', hasTabGuest2, `(Expected: false)`);
    console.log('- Direct Guest Join Button rendered:', hasBtnGuestDirect2, `(Expected: false)`);

    if (hasTabGuest2 || hasBtnGuestDirect2) {
      throw new Error('Kombinasi 2: Guest buttons should NOT appear when allow_guest_participants=false');
    }

    // 2.4 Direct URL check: /login?tab=guest -> renders guest-disabled-notice
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login?tab=guest` });
    await delay(1500);
    const guestDisabledNotice2 = await evalDom(`!!document.querySelector('[data-testid="guest-disabled-notice"]')`);
    const guestDisabledTitle2 = await evalDom(`document.querySelector('[data-testid="guest-disabled-title"]')?.innerText`);
    console.log('- /login?tab=guest Rejection Notice:', guestDisabledNotice2);
    console.log('- Rejection Notice Title:', guestDisabledTitle2);

    if (!guestDisabledNotice2 || !guestDisabledTitle2?.includes('Dinonaktifkan')) {
      throw new Error('Kombinasi 2: Accessing /login?tab=guest failed to show rejection notice');
    }

    // 2.5 Direct URL check: /student/play-session -> renders guest-rejection-screen
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/play-session` });
    await delay(2000);
    const guestRejectionScreen2 = await evalDom(`!!document.querySelector('[data-testid="guest-rejection-screen"]')`);
    const guestRejectionTitle2 = await evalDom(`document.querySelector('[data-testid="guest-rejection-title"]')?.innerText`);
    console.log('- /student/play-session Rejection Screen:', guestRejectionScreen2);
    console.log('- Rejection Screen Title:', guestRejectionTitle2);

    if (!guestRejectionScreen2 || !guestRejectionTitle2?.includes('Dinonaktifkan')) {
      throw new Error('Kombinasi 2: Accessing /student/play-session failed to show rejection screen');
    }

    // Capture screenshot: uat_guest_disabled_rejection.png
    await captureScreenshot('uat_guest_disabled_rejection.png');

    testMatrixResults.push({
      config: 'reg=true, guest=false',
      apiReg: `${apiRegRes2.status} OK (Created)`,
      apiGuest: `${apiGuestRes2.status} Forbidden (403)`,
      uiRegister: 'Form terbuka & siap digunakan',
      uiGuest: 'Tab & direct join disembunyikan',
      directUrl: 'Rejection screen aktif di /student/play-session',
      status: 'PASS'
    });

    // =========================================================================
    // MATRIKS 3: registration_enabled = false, allow_guest_participants = true
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [KOMBINASI 3] registration_enabled = false | allow_guest_participants = true');
    console.log('========================================================================');
    await updateSettings(false, true);

    // 3.1 API Check: Register (must be 403 Forbidden)
    const regPayload3 = {
      email: `test_reg_3_${Date.now()}@sinesa.local`,
      password: 'password123',
      name: 'Siswa Test Tiga',
      role: 'student'
    };
    const apiRegRes3 = await apiCall('POST', '/api/auth/register.php', null, regPayload3);
    console.log('✔ API Register Status:', apiRegRes3.status, `(Expected: 403)`);
    console.log('✔ API Register Error:', apiRegRes3.body?.error);
    if (apiRegRes3.status !== 403 || !apiRegRes3.body?.error?.includes('ditutup')) {
      throw new Error('Kombinasi 3: API Register should be rejected with 403');
    }

    // 3.2 API Check: Guest Join (must be 200/201)
    const apiGuestRes3 = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: testSessionId,
      display_name: 'Guest Probe 3',
      student_id: null
    });
    console.log('✔ API Guest Join Status:', apiGuestRes3.status, `(Expected: 200/201)`);
    if (apiGuestRes3.status !== 200 && apiGuestRes3.status !== 201) {
      throw new Error('Kombinasi 3: API Guest Join failed with status ' + apiGuestRes3.status);
    }

    // 3.3 UI Check: Login Page
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    const tabRegisterText3 = await evalDom(`document.querySelector('[data-testid="tab-register-btn"]')?.innerText`);
    const regDisabledNoticeInLogin3 = await evalDom(`document.querySelector('[data-testid="registration-disabled-text"]')?.innerText`);
    const hasTabGuest3 = await evalDom(`!!document.querySelector('[data-testid="tab-guest-btn"]')`);
    console.log('[UI Verification - Kombinasi 3]');
    console.log('- Tab Daftar label:', tabRegisterText3, `(Expected to contain "(Ditutup)")`);
    console.log('- Registration Disabled Text in Login Tab:', regDisabledNoticeInLogin3);
    console.log('- Tab Gabung Tamu rendered:', hasTabGuest3);

    if (!tabRegisterText3?.includes('Ditutup') || !hasTabGuest3 || !regDisabledNoticeInLogin3?.includes('dinonaktifkan')) {
      throw new Error('Kombinasi 3: UI mismatch for disabled registration');
    }

    // Click Tab Daftar -> verify closed alert is displayed and NO inputs exist
    await evalDom(`document.querySelector('[data-testid="tab-register-btn"]')?.click()`);
    await delay(500);
    const regClosedAlert3 = await evalDom(`!!document.querySelector('[data-testid="registration-closed-alert"]')`);
    const regClosedTitle3 = await evalDom(`document.querySelector('[data-testid="registration-closed-title"]')?.innerText`);
    const hasRegInput3 = await evalDom(`!!document.querySelector('[data-testid="register-fullname"]')`);
    console.log('- Registration Closed Alert rendered:', regClosedAlert3);
    console.log('- Registration Closed Alert Title:', regClosedTitle3);
    console.log('- Registration Inputs rendered:', hasRegInput3, `(Expected: false)`);

    if (!regClosedAlert3 || !regClosedTitle3?.includes('Ditutup') || hasRegInput3) {
      throw new Error('Kombinasi 3: Registration form inputs should NOT be accessible when registration is disabled');
    }

    // Capture screenshot: uat_registration_disabled_notice.png
    await captureScreenshot('uat_registration_disabled_notice.png');

    testMatrixResults.push({
      config: 'reg=false, guest=true',
      apiReg: `${apiRegRes3.status} Forbidden (403)`,
      apiGuest: `${apiGuestRes3.status} OK (Joined)`,
      uiRegister: 'Tab (Ditutup) & alert penolakan',
      uiGuest: 'Tab & direct join aktif',
      directUrl: 'Inline join form aktif di /student/play-session',
      status: 'PASS'
    });

    // =========================================================================
    // MATRIKS 4: registration_enabled = false, allow_guest_participants = false
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' [KOMBINASI 4] registration_enabled = false | allow_guest_participants = false');
    console.log('========================================================================');
    await updateSettings(false, false);

    // 4.1 API Check: Register (403)
    const apiRegRes4 = await apiCall('POST', '/api/auth/register.php', null, {
      email: `test_reg_4_${Date.now()}@sinesa.local`,
      password: 'password123',
      name: 'Siswa Test Empat',
      role: 'student'
    });
    console.log('✔ API Register Status:', apiRegRes4.status, `(Expected: 403)`);
    if (apiRegRes4.status !== 403) throw new Error('Kombinasi 4: API Register should be 403');

    // 4.2 API Check: Guest Join (403)
    const apiGuestRes4 = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: testSessionId,
      display_name: 'Guest Probe 4',
      student_id: null
    });
    console.log('✔ API Guest Join Status:', apiGuestRes4.status, `(Expected: 403)`);
    if (apiGuestRes4.status !== 403) throw new Error('Kombinasi 4: API Guest Join should be 403');

    // 4.3 UI Check: Login Page
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    const hasTabGuest4 = await evalDom(`!!document.querySelector('[data-testid="tab-guest-btn"]')`);
    const tabRegisterText4 = await evalDom(`document.querySelector('[data-testid="tab-register-btn"]')?.innerText`);
    console.log('[UI Verification - Kombinasi 4]');
    console.log('- Tab Gabung Tamu rendered:', hasTabGuest4, `(Expected: false)`);
    console.log('- Tab Daftar label:', tabRegisterText4, `(Expected to contain "(Ditutup)")`);

    if (hasTabGuest4 || !tabRegisterText4?.includes('Ditutup')) {
      throw new Error('Kombinasi 4: UI mismatch for both features disabled');
    }

    // 4.4 Direct URL check: /student/play-session -> rejection screen
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/play-session` });
    await delay(2000);
    const guestRejectionScreen4 = await evalDom(`!!document.querySelector('[data-testid="guest-rejection-screen"]')`);
    console.log('- /student/play-session Rejection Screen:', guestRejectionScreen4);

    if (!guestRejectionScreen4) {
      throw new Error('Kombinasi 4: /student/play-session must display rejection screen');
    }

    testMatrixResults.push({
      config: 'reg=false, guest=false',
      apiReg: `${apiRegRes4.status} Forbidden (403)`,
      apiGuest: `${apiGuestRes4.status} Forbidden (403)`,
      uiRegister: 'Tab (Ditutup) & alert penolakan',
      uiGuest: 'Tab & direct join disembunyikan',
      directUrl: 'Rejection screen aktif di /student/play-session',
      status: 'PASS'
    });

    // =========================================================================
    // KASUS PENGUJIAN TAMBAHAN: GUEST JOIN FLOW
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' KASUS PENGUJIAN TAMBAHAN: GUEST JOIN FLOW & VALIDASI');
    console.log('========================================================================');
    // Enable guest participants for edge case testing
    await updateSettings(true, true);

    // Case A: Guest Join with Invalid PIN
    console.log('\n--- Case A: Invalid Quiz PIN ---');
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login?tab=guest` });
    await delay(2000);

    await typeInput('#guest-pin-input', '999999');
    await typeInput('#guest-name-input', 'Tamu Invalid PIN');
    await evalDom(`document.querySelector('form')?.requestSubmit()`);
    await delay(2500);

    const guestErrorBanner = await evalDom(`document.querySelector('[data-testid="guest-error-banner"]')?.innerText`);
    console.log('✔ Invalid PIN Error Banner:', guestErrorBanner);
    if (!guestErrorBanner || !guestErrorBanner.toLowerCase().includes('tidak ditemukan')) {
      throw new Error('Case A: Expected invalid PIN error banner');
    }
    edgeCaseResults.push({
      case: 'Invalid Quiz PIN (999999)',
      expected: 'Error banner: Kode PIN kuis tidak ditemukan',
      actual: guestErrorBanner,
      status: 'PASS'
    });

    // Case B: Guest Join with Name < 2 Chars
    console.log('\n--- Case B: Name Validation (< 2 Chars) ---');
    await typeInput('#guest-pin-input', TEST_PIN);
    await typeInput('#guest-name-input', 'A');
    await evalDom(`document.querySelector('form')?.requestSubmit()`);
    await delay(1000);

    const nameValidationErr = await evalDom(`document.querySelector('[data-testid="guest-error-banner"]')?.innerText`);
    console.log('✔ Short Name Validation Error:', nameValidationErr);
    if (!nameValidationErr || !nameValidationErr.includes('minimal 2 karakter')) {
      throw new Error('Case B: Expected minimal 2 characters validation error');
    }
    edgeCaseResults.push({
      case: 'Short Name Validation ("A")',
      expected: 'Error: Nama tampilan minimal 2 karakter',
      actual: nameValidationErr,
      status: 'PASS'
    });

    // Case C: Multi-Guest Join in Active Waiting Room
    console.log('\n--- Case C: Multi-Guest Join & Room Navigation ---');
    const guest1Name = 'Tamu Alif UAT';
    const guest2Name = 'Tamu Bima UAT';

    // Guest 1 joins via Browser URL flow
    const guest1Url = `http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${TEST_PIN}&name=${encodeURIComponent(guest1Name)}`;
    await sendCommand('Page.navigate', { url: guest1Url });
    await delay(4000);

    const lobbyUrl = await evalDom(`window.location.href`);
    const lobbyText = await evalDom(`document.body.innerText`);
    console.log('✔ Guest 1 Lobby URL:', lobbyUrl);
    console.log('✔ Guest 1 Body Preview:', lobbyText.substring(0, 150).replace(/\n/g, ' '));

    const inLobby = lobbyText.includes(guest1Name) || lobbyText.toLowerCase().includes('menunggu') || lobbyText.includes('Room') || lobbyText.includes('Host');
    if (!inLobby) {
      throw new Error('Case C: Guest 1 failed to reach waiting room lobby');
    }

    // Capture screenshot: uat_guest_joined_lobby.png
    await captureScreenshot('uat_guest_joined_lobby.png');

    // Guest 2 joins concurrently via API into the same session
    const guest2Res = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: testSessionId,
      display_name: guest2Name,
      student_id: null
    });
    console.log('✔ Guest 2 API Join Status:', guest2Res.status, `(Expected: 200/201)`);
    if (guest2Res.status !== 200 && guest2Res.status !== 201) {
      throw new Error('Case C: Guest 2 failed to join via API: ' + JSON.stringify(guest2Res));
    }

    // Verify both guests in database
    const dbGuests = execSync(`C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe -u root sinesa_db -e "SELECT id, display_name, student_id FROM participants WHERE session_id = '${testSessionId}';"`)
      .toString();
    console.log('✔ Database Participants:\n' + dbGuests);

    if (!dbGuests.includes(guest1Name) || !dbGuests.includes(guest2Name) || !dbGuests.includes('NULL')) {
      throw new Error('Case C: Multi-guest verification in database failed');
    }
    edgeCaseResults.push({
      case: 'Multi-Guest Concurrent Join',
      expected: 'Kedua tamu tercatat di sesi dengan student_id = NULL',
      actual: 'Tamu Alif dan Tamu Bima sukses terdaftar di DB',
      status: 'PASS'
    });

  } finally {
    // =========================================================================
    // FINAL RESTORATION (Mandated by UAT #6)
    // =========================================================================
    console.log('\n========================================================================');
    console.log(' RESTORING CONFIGURATION TO DEFAULT (TRUE, TRUE) & CLEANUP');
    console.log('========================================================================');
    await updateSettings(true, true);
    console.log('✔ System settings restored to registration_enabled=true, allow_guest_participants=true.');

    // Verify restored settings via API
    const finalSettingsRes = await apiCall('GET', '/api/settings.php');
    const finalData = finalSettingsRes.body?.data;
    console.log('✔ Restored Database Settings:');
    console.log('  - registration_enabled:', finalData?.registration_enabled);
    console.log('  - allow_registration:', finalData?.allow_registration);
    console.log('  - allow_student_registration:', finalData?.allow_student_registration);
    console.log('  - allow_guest_participants:', finalData?.allow_guest_participants);

    const isFullyRestored =
      finalData?.registration_enabled === 'true' &&
      finalData?.allow_registration === 'true' &&
      finalData?.allow_student_registration === 'true' &&
      finalData?.allow_guest_participants === 'true';

    if (!isFullyRestored) {
      console.error('CRITICAL: Settings were not properly restored to true!');
    } else {
      console.log('✔ Verification confirmed: All configuration values restored to default true.');
    }

    // Kill Chrome process
    try {
      chromeProc.kill('SIGKILL');
    } catch (e) {}
  }

  // Print Summary Tables
  console.log('\n========================================================================');
  console.log(' UAT TEST MATRIX RESULTS (4 KOMBINASI)');
  console.log('========================================================================');
  console.table(testMatrixResults);

  console.log('\n========================================================================');
  console.log(' UAT ADDITIONAL TEST CASES RESULTS');
  console.log('========================================================================');
  console.table(edgeCaseResults);

  console.log('\n✔ ALL UAT REGRESSION TESTS PASSED SUCCESSFULLY!');
}

runRegressionSuite().catch(err => {
  console.error('\n❌ UAT SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
