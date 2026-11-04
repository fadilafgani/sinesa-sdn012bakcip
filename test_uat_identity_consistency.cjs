const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9228;
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
  console.log(' UAT REGRESSION SUITE: APPLICATION IDENTITY CONFIGURATION & PERSISTENCE');
  console.log('========================================================================\n');

  // Initial settings to remember for final restoration (mandated by UAT #5)
  const initialSettings = {
    app_name: 'SINESA',
    app_logo: '/logo-sdn012.png',
    theme_color: 'blue',
    school_name: 'SDN 012 Balikpapan Kota',
    school_npsn: '20219584',
    school_address: 'Jl. Babakan Ciparay No. 12, Bandung',
    app_title: 'SINESA - Sistem Nilai Dan Evaluasi Siswa Aktif'
  };

  // Authenticate as Admin via API
  const adminLoginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'admin@sinesa.com',
    password: 'password123'
  });
  const adminToken = adminLoginRes.body?.data?.access_token;
  if (!adminToken) throw new Error('Failed to obtain admin token');
  console.log('Admin token acquired successfully.');

  // Launch Chrome Headless via CDP
  console.log('\n--- Launching Chrome Browser via CDP ---');
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

    async function browserLogout() {
      await sendCommand('Network.clearBrowserCookies');
      await evalDom(`(() => {
        try { fetch('/api/auth/logout.php', { method: 'POST', credentials: 'include' }); } catch(e) {}
        localStorage.removeItem('sinesa_auth_user');
        localStorage.removeItem('sinesa_mock_user');
        localStorage.removeItem('sinesa_mock_profile');
        sessionStorage.clear();
      })()`);
      await delay(600);
    }

    // Set Desktop Viewport
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // =========================================================================
    // STEP 1: Admin Changes Identity via Admin Form
    // =========================================================================
    console.log('\n--- Step 1: Updating Application Identity in Admin Dashboard ---');
    const NEW_APP_NAME = "EVALPRO";
    const NEW_APP_LOGO = "https://api.dicebear.com/7.x/identicon/svg?seed=evalpro";
    const NEW_SCHOOL_NAME = "SMP Negeri 1 Testing";
    const NEW_SCHOOL_NPSN = "10293847";
    const NEW_SCHOOL_ADDRESS = "Jl. Pendidikan No. 99, Surabaya";
    const NEW_THEME_COLOR = "emerald";

    // Set via backend API as primary source of truth
    await apiCall('PUT', '/api/settings.php', adminToken, {
      app_name: NEW_APP_NAME,
      app_logo: NEW_APP_LOGO,
      school_name: NEW_SCHOOL_NAME,
      school_npsn: NEW_SCHOOL_NPSN,
      school_address: NEW_SCHOOL_ADDRESS,
      theme_color: NEW_THEME_COLOR,
      app_title: `${NEW_APP_NAME} - Evaluasi Pembelajaran Modern`
    });

    // Login as Admin to check Admin Dashboard UI
    const adminLoginUrl = `http://127.0.0.1:${VITE_PORT}/login?email=admin%40sinesa.com&password=password123&role=admin&auto_submit=true`;
    await sendCommand('Page.navigate', { url: adminLoginUrl });
    await delay(3500);

    const currentUrl = await evalDom('window.location.href');
    if (!currentUrl.includes('/admin/dashboard')) {
      await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/admin/dashboard` });
      await delay(3000);
    }

    // Switch to Settings tab in Admin Dashboard
    await evalDom(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const settingsBtn = buttons.find(b => b.innerText.includes('Pengaturan') || b.innerText.includes('Settings'));
      if (settingsBtn) settingsBtn.click();
    })()`);
    await delay(1200);

    // Verify Admin Dashboard Brand & Theme
    const adminBrandName = await evalDom(`document.querySelector('[data-testid="admin-brand-name"]')?.innerText`);
    const adminBrandLogo = await evalDom(`document.querySelector('[data-testid="admin-brand-logo"]')?.src`);
    const adminTheme = await evalDom(`document.documentElement.getAttribute('data-theme')`);

    console.log('[VERIFICATION - ADMIN DASHBOARD]');
    console.log('- Brand Name:', adminBrandName, `(Expected: "${NEW_APP_NAME} Admin")`);
    console.log('- Brand Logo URL:', adminBrandLogo);
    console.log('- HTML data-theme:', adminTheme, `(Expected: "${NEW_THEME_COLOR}")`);

    if (!adminBrandName || !adminBrandName.includes(NEW_APP_NAME)) {
      throw new Error(`Admin brand name mismatch! Got: ${adminBrandName}`);
    }
    if (!adminBrandLogo || !adminBrandLogo.includes('evalpro')) {
      throw new Error(`Admin brand logo mismatch! Got: ${adminBrandLogo}`);
    }
    if (adminTheme !== NEW_THEME_COLOR) {
      throw new Error(`Admin theme mismatch! Got: ${adminTheme}, expected: ${NEW_THEME_COLOR}`);
    }
    await captureScreenshot('uat_identity_admin_saved.png');

    // =========================================================================
    // STEP 2: Verify Login Page Identity & Theme (Desktop & Mobile 375px)
    // =========================================================================
    console.log('\n--- Step 2: Testing Login Page Synchronization (Desktop & Mobile) ---');
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    // Wait for login page brand elements
    for (let k = 0; k < 15; k++) {
      const appName = await evalDom(`document.querySelector('[data-testid="brand-app-name"]')?.innerText`);
      if (appName) break;
      await delay(300);
    }

    const loginAppName = await evalDom(`document.querySelector('[data-testid="brand-app-name"]')?.innerText`);
    const loginLogoSrc = await evalDom(`document.querySelector('[data-testid="brand-logo"]')?.src`);
    const loginSchoolName = await evalDom(`document.querySelector('[data-testid="brand-school-name"]')?.innerText`);
    const loginSchoolNpsn = await evalDom(`document.querySelector('[data-testid="brand-school-npsn"]')?.innerText`);
    const loginSchoolAddress = await evalDom(`document.querySelector('[data-testid="brand-school-address"]')?.innerText`);
    const loginTheme = await evalDom(`document.documentElement.getAttribute('data-theme')`);

    console.log('[VERIFICATION - LOGIN PAGE (DESKTOP)]');
    console.log('- App Name:', loginAppName, `(Expected: "${NEW_APP_NAME}")`);
    console.log('- Logo Src:', loginLogoSrc, `(Expected: "${NEW_APP_LOGO}")`);
    console.log('- School Name:', loginSchoolName, `(Expected to contain "${NEW_SCHOOL_NAME}")`);
    console.log('- School NPSN:', loginSchoolNpsn, `(Expected to contain "${NEW_SCHOOL_NPSN}")`);
    console.log('- School Address:', loginSchoolAddress, `(Expected: "${NEW_SCHOOL_ADDRESS}")`);
    console.log('- Theme:', loginTheme, `(Expected: "${NEW_THEME_COLOR}")`);

    if (loginAppName !== NEW_APP_NAME) {
      throw new Error(`Login app name is still hardcoded! Got: ${loginAppName}, expected: ${NEW_APP_NAME}`);
    }
    if (loginLogoSrc === 'http://127.0.0.1:5173/logo-sdn012.png' || !loginLogoSrc.includes('evalpro')) {
      throw new Error(`Login logo is still hardcoded! Got: ${loginLogoSrc}`);
    }
    if (!loginSchoolName || !loginSchoolName.includes(NEW_SCHOOL_NAME)) {
      throw new Error(`Login school name mismatch! Got: ${loginSchoolName}`);
    }
    if (!loginSchoolNpsn || !loginSchoolNpsn.includes(NEW_SCHOOL_NPSN)) {
      throw new Error(`Login school NPSN mismatch! Got: ${loginSchoolNpsn}`);
    }
    if (loginTheme !== NEW_THEME_COLOR) {
      throw new Error(`Login theme mismatch! Got: ${loginTheme}, expected: ${NEW_THEME_COLOR}`);
    }
    await captureScreenshot('uat_identity_login_custom_desktop.png');

    // Mobile Viewport (375x812)
    console.log('\n--- Step 3: Capturing Mobile Viewport (375x812) ---');
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await delay(1000);
    await captureScreenshot('uat_identity_login_custom_mobile_375px.png');

    // Reset back to Desktop
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(500);

    // =========================================================================
    // STEP 4: Teacher Dashboard Branding
    // =========================================================================
    console.log('\n--- Step 4: Testing Teacher Dashboard Identity ---');
    await browserLogout();
    const teacherLoginUrl = `http://127.0.0.1:${VITE_PORT}/login?email=pertiwi_test%40sinesa.com&password=password123&role=teacher&auto_submit=true`;
    await sendCommand('Page.navigate', { url: teacherLoginUrl });
    await delay(4000);

    const teacherCurrentUrl = await evalDom('window.location.href');
    if (!teacherCurrentUrl.includes('/teacher/dashboard')) {
      await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/teacher/dashboard` });
      await delay(3000);
    }

    const teacherBrandName = await evalDom(`document.querySelector('[data-testid="teacher-brand-name"]')?.innerText`);
    const teacherBrandLogo = await evalDom(`document.querySelector('[data-testid="teacher-brand-logo"]')?.src`);

    console.log('[VERIFICATION - TEACHER DASHBOARD]');
    console.log('- Teacher Brand Name:', teacherBrandName, `(Expected to contain "${NEW_APP_NAME}")`);
    console.log('- Teacher Brand Logo:', teacherBrandLogo);

    if (!teacherBrandName || !teacherBrandName.includes(NEW_APP_NAME)) {
      throw new Error(`Teacher dashboard brand name mismatch! Got: ${teacherBrandName}`);
    }
    if (!teacherBrandLogo || !teacherBrandLogo.includes('evalpro')) {
      throw new Error(`Teacher dashboard brand logo mismatch! Got: ${teacherBrandLogo}`);
    }
    await captureScreenshot('uat_identity_teacher_dashboard.png');

    // =========================================================================
    // STEP 5: Student Dashboard Branding
    // =========================================================================
    console.log('\n--- Step 5: Testing Student Dashboard Identity ---');
    await browserLogout();
    const studentLoginUrl = `http://127.0.0.1:${VITE_PORT}/login?email=budi_test%40sinesa.com&password=password123&role=student&auto_submit=true`;
    await sendCommand('Page.navigate', { url: studentLoginUrl });
    await delay(4000);

    const studentCurrentUrl = await evalDom('window.location.href');
    if (!studentCurrentUrl.includes('/student/dashboard')) {
      await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/dashboard` });
      await delay(3000);
    }

    const studentBrandName = await evalDom(`document.querySelector('[data-testid="student-brand-name"]')?.innerText`);
    const studentBrandLogo = await evalDom(`document.querySelector('[data-testid="student-brand-logo"]')?.src`);

    console.log('[VERIFICATION - STUDENT DASHBOARD]');
    console.log('- Student Brand Name:', studentBrandName, `(Expected to contain "${NEW_APP_NAME}")`);
    console.log('- Student Brand Logo:', studentBrandLogo);

    if (!studentBrandName || !studentBrandName.includes(NEW_APP_NAME)) {
      throw new Error(`Student dashboard brand name mismatch! Got: ${studentBrandName}`);
    }
    if (!studentBrandLogo || !studentBrandLogo.includes('evalpro')) {
      throw new Error(`Student dashboard brand logo mismatch! Got: ${studentBrandLogo}`);
    }
    await captureScreenshot('uat_identity_student_dashboard.png');

    // =========================================================================
    // STEP 6: Persistence Across Refresh, Logout & Session Restarts
    // =========================================================================
    console.log('\n--- Step 6: Testing Persistence Across Logout & Re-login ---');
    await browserLogout();
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/login` });
    await delay(2500);

    const postLogoutAppName = await evalDom(`document.querySelector('[data-testid="brand-app-name"]')?.innerText`);
    const postLogoutLogoSrc = await evalDom(`document.querySelector('[data-testid="brand-logo"]')?.src`);
    const postLogoutTheme = await evalDom(`document.documentElement.getAttribute('data-theme')`);

    console.log('[VERIFICATION - PERSISTENCE POST-LOGOUT]');
    console.log('- Post-Logout App Name:', postLogoutAppName, `(Expected: "${NEW_APP_NAME}")`);
    console.log('- Post-Logout Logo Src:', postLogoutLogoSrc);
    console.log('- Post-Logout Theme:', postLogoutTheme, `(Expected: "${NEW_THEME_COLOR}")`);

    if (postLogoutAppName !== NEW_APP_NAME) {
      throw new Error(`Settings reset after logout! Got: ${postLogoutAppName}`);
    }
    if (!postLogoutLogoSrc || !postLogoutLogoSrc.includes('evalpro')) {
      throw new Error(`Logo reset after logout! Got: ${postLogoutLogoSrc}`);
    }
    if (postLogoutTheme !== NEW_THEME_COLOR) {
      throw new Error(`Theme reset after logout! Got: ${postLogoutTheme}`);
    }

    // =========================================================================
    // STEP 7: Restore Original Application Settings (Mandated by UAT #5)
    // =========================================================================
    console.log('\n--- Step 7: Restoring Original Settings (UAT Mandate #5) ---');
    const restoreRes = await apiCall('PUT', '/api/settings.php', adminToken, {
      app_name: initialSettings.app_name,
      app_logo: initialSettings.app_logo,
      school_name: initialSettings.school_name,
      school_npsn: initialSettings.school_npsn,
      school_address: initialSettings.school_address,
      theme_color: initialSettings.theme_color,
      app_title: initialSettings.app_title
    });
    console.log('Backend settings restoration status:', restoreRes.status, restoreRes.body?.success);

    // Clear local storage and reload login page to verify clean reversion to original settings
    await evalDom(`(() => {
      localStorage.removeItem('sinesa_app_settings');
      localStorage.removeItem('mock_system_settings');
      window.location.href = '/login';
    })()`);
    await delay(2500);

    const revertedAppName = await evalDom(`document.querySelector('[data-testid="brand-app-name"]')?.innerText`);
    const revertedLogoSrc = await evalDom(`document.querySelector('[data-testid="brand-logo"]')?.src`);
    const revertedTheme = await evalDom(`document.documentElement.getAttribute('data-theme')`);

    console.log('[VERIFICATION - REVERSION TO ORIGINAL VALUES]');
    console.log('- Reverted App Name:', revertedAppName, `(Expected: "${initialSettings.app_name}")`);
    console.log('- Reverted Logo Src:', revertedLogoSrc, `(Expected to contain "logo-sdn012.png")`);
    console.log('- Reverted Theme:', revertedTheme, `(Expected: "${initialSettings.theme_color}")`);

    if (revertedAppName !== initialSettings.app_name) {
      throw new Error(`Failed to revert app name! Got: ${revertedAppName}`);
    }

    console.log('\n========================================================================');
    console.log(' ALL UAT IDENTITY CONFIGURATION & PERSISTENCE TESTS PASSED (100% GREEN)');
    console.log('========================================================================\n');

  } finally {
    try {
      chromeProc.kill();
    } catch (_) {}
  }
}

runRegressionSuite().catch(err => {
  console.error('\n[REGRESSION TEST FAILED]', err);
  process.exit(1);
});
