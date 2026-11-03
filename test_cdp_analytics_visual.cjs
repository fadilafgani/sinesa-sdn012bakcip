const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9225;
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
  console.log(' ANALYTICS VISUAL E2E TEST (CDP): Average Score & Option Distribution');
  console.log('========================================================================\n');

  // 1. Authenticate Teacher
  const loginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const token = loginRes.body?.data?.access_token || loginRes.body?.data?.token;
  const user = loginRes.body?.data?.user;
  const profile = {
    id: user.id,
    role: user.role,
    full_name: user.full_name || 'Guru Pertiwi',
    school_name: 'SDN 012 Babakan Ciparay',
  };

  execSync('php setup_test_quiz.php');
  const quizId = 'quiz-uat-timeout-5q';

  // Fetch questions & options
  const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, token);
  const questions = questionsRes.body?.data || [];
  const qIds = questions.map(q => q.id);

  const optionsRes = await apiCall('GET', `/api/questions/index.php?question_ids=${qIds.join(',')}&type=options`, token);
  const allOptions = optionsRes.body?.data || [];

  const q1Opts = allOptions.filter(o => o.question_id === questions[0].id);
  const q2Opts = allOptions.filter(o => o.question_id === questions[1].id);

  // Terminate previous sessions
  await apiCall('PUT', '/api/sessions/index.php?action=terminate', token, { quiz_id: quizId });

  // Create session
  const pin = '779911';
  const sessRes = await apiCall('POST', '/api/sessions/index.php', token, {
    quiz_id: quizId,
    pin_code: pin,
    quiz_mode: 'serius',
    status: 'active',
    current_stage: 'question',
  });
  const session = sessRes.body?.data;
  console.log(`Live Session created: ID ${session.id}, PIN ${pin}`);

  // Create 4 participants with representative answer choices
  // Siswa 1: Q1 -> A (Correct), Q2 -> A (Correct) => Score 200
  const p1 = (await apiCall('POST', '/api/participants/index.php', null, { session_id: session.id, display_name: 'Ani Wijaya' })).body?.data;
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p1.id, question_id: questions[0].id, selected_option_id: q1Opts[0].id });
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p1.id, question_id: questions[1].id, selected_option_id: q2Opts[0].id });
  await apiCall('PUT', `/api/participants/index.php?id=${p1.id}`, null, { is_completed: true });

  // Siswa 2: Q1 -> A (Correct), Q2 -> B (Wrong) => Score 100
  const p2 = (await apiCall('POST', '/api/participants/index.php', null, { session_id: session.id, display_name: 'Budi Santoso' })).body?.data;
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p2.id, question_id: questions[0].id, selected_option_id: q1Opts[0].id });
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p2.id, question_id: questions[1].id, selected_option_id: q2Opts[1].id });
  await apiCall('PUT', `/api/participants/index.php?id=${p2.id}`, null, { is_completed: true });

  // Siswa 3: Q1 -> B (Wrong), Q2 -> A (Correct) => Score 100
  const p3 = (await apiCall('POST', '/api/participants/index.php', null, { session_id: session.id, display_name: 'Citra Kirana' })).body?.data;
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p3.id, question_id: questions[0].id, selected_option_id: q1Opts[1].id });
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p3.id, question_id: questions[1].id, selected_option_id: q2Opts[0].id });
  await apiCall('PUT', `/api/participants/index.php?id=${p3.id}`, null, { is_completed: true });

  // Siswa 4: Q1 -> C (Wrong), Q2 -> timeout (Tidak Dijawab) => Score 0
  const p4 = (await apiCall('POST', '/api/participants/index.php', null, { session_id: session.id, display_name: 'Dedi Kurnia' })).body?.data;
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p4.id, question_id: questions[0].id, selected_option_id: q1Opts[2].id });
  await apiCall('POST', '/api/answers/submit.php', null, { participant_id: p4.id, question_id: questions[1].id, selected_option_id: null, is_timeout: true });
  await apiCall('PUT', `/api/participants/index.php?id=${p4.id}`, null, { is_completed: true });

  // Complete session
  await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, token, {
    status: 'completed',
    current_stage: 'finished',
  });

  console.log('Seeded 4 participants (Avg Score expected: 100 Pts, Q1: A=50%, B=25%, C=25%, D=0%).');

  // Launch Chrome Headless
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

    // 1. Desktop Viewport (1280x1200)
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Step A: Login as teacher via UI auto_submit
    const loginUrl = `http://127.0.0.1:${VITE_PORT}/login?email=regression_teacher%40sinesa.com&password=password123&role=teacher&auto_submit=true`;
    console.log(`Logging in via ${loginUrl}...`);
    await sendCommand('Page.navigate', { url: loginUrl });
    await delay(2500);

    // Step B: Navigate to Analytics Page
    const targetUrl = `http://127.0.0.1:${VITE_PORT}/teacher/analytics?id=${quizId}&session_id=${session.id}`;
    console.log(`Navigating to ${targetUrl}...`);
    await sendCommand('Page.navigate', { url: targetUrl });
    await delay(3500);

    // Capture Desktop Screenshot
    const deskShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const deskPath = path.join(ARTIFACT_DIR, 'uat_analytics_dashboard_desktop.png');
    fs.writeFileSync(deskPath, Buffer.from(deskShot.data, 'base64'));
    console.log(`[SAVED] Desktop screenshot: ${deskPath}`);

    // Capture Scrolled View focusing on Question Distributions (including timeout)
    await sendCommand('Runtime.evaluate', {
      expression: `window.scrollTo(0, 850)`
    });
    await delay(1000);
    const detailShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const detailPath = path.join(ARTIFACT_DIR, 'uat_analytics_question_distribution_detail.png');
    fs.writeFileSync(detailPath, Buffer.from(detailShot.data, 'base64'));
    console.log(`[SAVED] Scrolled distribution screenshot: ${detailPath}`);

    // 2. Mobile Viewport (375x812, DPR 2)
    console.log('Switching to mobile viewport (375x812)...');
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await delay(1500);

    const mobileShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const mobilePath = path.join(ARTIFACT_DIR, 'uat_analytics_dashboard_mobile_375px.png');
    fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, 'base64'));
    console.log(`[SAVED] Mobile screenshot: ${mobilePath}`);

    console.log('\nAnalytics Visual E2E verification complete!');
  } finally {
    try { chromeProc.kill(); } catch (_) {}
  }
}

runVisualUat().catch(err => {
  console.error('Visual UAT failed:', err);
  process.exit(1);
});
