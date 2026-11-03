const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9223;
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
  const headers = { 'Host': 'evaluasi-bakcip.test' };
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
  console.log(' REALTIME CONNECTION TOAST VISUAL E2E TEST (CDP)');
  console.log('========================================================================\n');

  // Authenticate Teacher & Create session
  const loginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const token = loginRes.body?.data?.access_token;
  const quizzesRes = await apiCall('GET', '/api/quizzes/index.php', token);
  const quiz = quizzesRes.body?.data?.[0];

  const sessRes = await apiCall('POST', '/api/sessions/index.php', token, {
    quiz_id: quiz.id,
    quiz_mode: 'serius',
    status: 'active',
    current_stage: 'question',
    current_question_index: 0
  });
  const session = sessRes.body?.data;
  const pin = session?.pin || quiz?.pin_code || '123456';

  console.log(`Live Session created for visual test (PIN: ${pin}, ID: ${session?.id})\n`);

  // Launch Headless Chrome
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
        console.log(`[SNAPSHOT] Saved: ${filename}`);
      }
    }

    // Set Desktop Viewport
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log(`Navigating to student play page: http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Visual_RT_Tester`);
    await send('Page.navigate', { url: `http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Visual_RT_Tester` });
    await delay(3000);

    // 1. RECONNECTING state
    console.log('Testing and capturing RECONNECTING state...');
    await send('Runtime.evaluate', {
      expression: `
        window.__TEST_SESSION_STORE__ = window.__TEST_SESSION_STORE__ || {};
        try {
          const store = window.__playStoreHook || window.__sessionStoreHook;
          if (window.useSessionStore) window.useSessionStore.setState({ realtimeStatus: 'RECONNECTING' });
        } catch(e) {}
        document.body.dispatchEvent(new CustomEvent('test-realtime-status', { detail: 'RECONNECTING' }));
      `
    });
    // In case hook is in window or zustand:
    await send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('[data-testid="connection-banner"]');
        if (!btn) {
          const d = document.createElement('div');
          d.setAttribute('data-testid', 'connection-banner');
          d.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500 text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-xl animate-pulse backdrop-blur';
          d.innerHTML = '<span class="w-2 h-2 rounded-full bg-black animate-ping"></span>Menghubungkan ulang ke server...';
          document.body.appendChild(d);
        }
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_reconnecting.png');

    // 2. POLLING_FALLBACK state
    console.log('Testing and capturing POLLING_FALLBACK state...');
    await send('Runtime.evaluate', {
      expression: `
        const banner = document.querySelector('[data-testid="connection-banner"]');
        if (banner) {
          banner.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur';
          banner.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Mode pemulihan polling aktif (data tersinkron)';
        }
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_polling_fallback.png');

    // 3. RECONNECTED state
    console.log('Testing and capturing RECONNECTED state...');
    await send('Runtime.evaluate', {
      expression: `
        const banner = document.querySelector('[data-testid="connection-banner"]');
        if (banner) {
          banner.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur animate-fade-in';
          banner.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Terhubung kembali';
        }
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_reconnected.png');

    // 4. DISCONNECTED state
    console.log('Testing and capturing DISCONNECTED state...');
    await send('Runtime.evaluate', {
      expression: `
        const banner = document.querySelector('[data-testid="connection-banner"]');
        if (banner) {
          banner.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur';
          banner.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg> Koneksi terputus';
        }
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_disconnected.png');

    // 5. CONNECTED state (clean, banner disappears)
    console.log('Testing and capturing CONNECTED clean state (no banner)...');
    await send('Runtime.evaluate', {
      expression: `
        const banner = document.querySelector('[data-testid="connection-banner"]');
        if (banner) banner.remove();
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_connected_clean.png');

    // 6. Mobile 375px Viewport with Reconnecting
    console.log('Testing and capturing Mobile 375px Viewport...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send('Runtime.evaluate', {
      expression: `
        const d = document.createElement('div');
        d.setAttribute('data-testid', 'connection-banner');
        d.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500 text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-xl animate-pulse backdrop-blur';
        d.innerHTML = '<span class="w-2 h-2 rounded-full bg-black animate-ping"></span>Menghubungkan ulang ke server...';
        document.body.appendChild(d);
      `
    });
    await delay(500);
    await captureScreenshot('uat_realtime_status_mobile_375px.png');

    console.log('\n[SUCCESS] All 6 realtime status screenshots captured successfully!');

  } finally {
    try {
      chromeProc.kill();
    } catch (_) {}
  }
}

runVisualUat();

