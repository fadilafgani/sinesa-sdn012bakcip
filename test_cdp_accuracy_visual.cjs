const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = 80;
const VITE_PORT = 5173;
const CHROME_DEBUG_PORT = 9224;
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
  console.log(' FINAL ACCURACY SUMMARY VISUAL E2E TEST (CDP)');
  console.log('========================================================================\n');

  // 1. Authenticate Teacher & Create session
  const loginRes = await apiCall('POST', '/api/auth/login.php', null, {
    email: 'regression_teacher@sinesa.com',
    password: 'password123'
  });
  const token = loginRes.body?.data?.access_token || loginRes.body?.data?.token;

  const { execSync } = require('child_process');
  execSync('php setup_test_quiz.php');

  const quizId = 'quiz-uat-timeout-5q';
  const pin = '998877';
  const questionsRes = await apiCall('GET', `/api/questions/index.php?quiz_id=${quizId}`, token);
  const questions = questionsRes.body?.data || [];

  const qDetails = [];
  for (const q of questions) {
    const optRes = await apiCall('GET', `/api/questions/index.php?type=options&question_id=${q.id}`, token);
    const opts = optRes.body?.data || [];
    const correctOpt = opts.find(o => o.is_correct);
    const wrongOpt = opts.find(o => !o.is_correct);
    qDetails.push({ question: q, options: opts, correctOpt, wrongOpt });
  }

  // Terminate any previous session for this quiz
  await apiCall('PUT', '/api/sessions/index.php?action=terminate', token, {
    quiz_id: quizId
  });

  const sessRes = await apiCall('POST', '/api/sessions/index.php', token, {
    quiz_id: quizId,
    pin_code: pin,
    quiz_mode: 'santai',
    lives_count: 3,
    status: 'active',
    current_stage: 'question',
    current_question_index: 0,
    show_correct_answer: true,
    show_final_result: true,
    show_leaderboard: true,
    show_answer_review: true,
  });
  const session = sessRes.body?.data;

  // Join participant
  const joinRes = await apiCall('POST', '/api/participants/index.php', null, {
    session_id: session.id,
    display_name: 'Budi Santoso',
  });
  const participant = joinRes.body?.data;

  console.log(`Live Session created (PIN: ${pin}, Participant: ${participant?.id})`);

  // Submit answers: 3 correct, 1 wrong, 1 timeout
  // Q1, Q2, Q3 correct
  for (let i = 0; i < 3; i++) {
    await apiCall('POST', '/api/answers/submit.php', null, {
      participant_id: participant.id,
      question_id: qDetails[i].question.id,
      selected_option_id: qDetails[i].correctOpt.id,
      response_time_ms: 1500,
    });
  }
  // Q4 wrong (lives drop from 3 to 2)
  await apiCall('POST', '/api/answers/submit.php', null, {
    participant_id: participant.id,
    question_id: qDetails[3].question.id,
    selected_option_id: qDetails[3].wrongOpt.id,
    response_time_ms: 2200,
  });
  // Q5 timeout
  await apiCall('POST', '/api/answers/submit.php', null, {
    participant_id: participant.id,
    question_id: qDetails[4].question.id,
    selected_option_id: null,
    is_timeout: true,
  });

  // End session to finished stage (keep status active so joining reconnects)
  await apiCall('PUT', `/api/sessions/index.php?id=${session.id}`, token, {
    status: 'active',
    current_stage: 'finished',
  });
  await apiCall('PUT', `/api/participants/index.php?id=${participant.id}`, null, {
    is_completed: true,
  });

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

    // 1. Desktop Viewport (1280x800)
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    const targetUrl = `http://127.0.0.1:${VITE_PORT}/student/play-session?pin=${pin}&name=Budi%20Santoso`;
    console.log(`Navigating to ${targetUrl} (Desktop)...`);
    await sendCommand('Page.navigate', { url: targetUrl });
    await delay(4500);

    // Capture Desktop Screenshot
    const deskShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const deskPath = path.join(ARTIFACT_DIR, 'uat_accuracy_summary_desktop.png');
    fs.writeFileSync(deskPath, Buffer.from(deskShot.data, 'base64'));
    console.log(`[SAVED] Desktop screenshot: ${deskPath}`);

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
    const mobilePath = path.join(ARTIFACT_DIR, 'uat_accuracy_summary_mobile_375px.png');
    fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, 'base64'));
    console.log(`[SAVED] Mobile screenshot: ${mobilePath}`);

    console.log('\nVisual E2E verification complete!');
  } finally {
    try { chromeProc.kill(); } catch (_) {}
  }
}

runVisualUat().catch(err => {
  console.error('Visual UAT failed:', err);
  process.exit(1);
});
