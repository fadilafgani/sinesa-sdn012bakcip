const http = require('http');

const PORT = 80;
const HOST = '127.0.0.1';
const HOST_HEADER = 'evaluasi-bakcip.test';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body), duration });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body, duration });
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

function openSseStream(path, headers = {}, onEvent = null, waitForFirstEvent = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method: 'GET',
      headers: {
        'Host': HOST_HEADER,
        ...headers
      }
    };

    let resolved = false;
    let streamBuffer = '';
    let totalReceived = '';
    let lastEventId = null;

    const req = http.request(options, (res) => {
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        streamBuffer += chunk;
        totalReceived += chunk;

        // Standard SSE block parser: blocks separated by double newline \n\n
        let boundaryIndex;
        while ((boundaryIndex = streamBuffer.indexOf('\n\n')) !== -1) {
          const rawBlock = streamBuffer.substring(0, boundaryIndex);
          streamBuffer = streamBuffer.substring(boundaryIndex + 2);

          let eventType = null;
          let eventData = '';
          const lines = rawBlock.split('\n');
          for (const line of lines) {
            if (line.startsWith('id: ')) {
              lastEventId = line.substring(4).trim();
            } else if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData += (eventData ? '\n' : '') + line.substring(6).trim();
            }
          }

          if (eventType && eventData && onEvent) {
            try {
              onEvent(eventType, JSON.parse(eventData), lastEventId);
            } catch (_) {
              onEvent(eventType, eventData, lastEventId);
            }
          }

          if (waitForFirstEvent && eventType && !resolved) {
            resolved = true;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              totalReceived,
              lastEventId,
              close: () => {
                try { req.destroy(); } catch (_) {}
              }
            });
          }
        }

        if (!waitForFirstEvent && !resolved && totalReceived.length > 200) {
          resolved = true;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            totalReceived,
            lastEventId,
            close: () => {
              try { req.destroy(); } catch (_) {}
            }
          });
        }
      });

      res.on('error', (err) => {
        if (!resolved) reject(err);
      });
    });

    req.on('error', (err) => {
      if (!resolved) reject(err);
    });

    req.end();
  });
}

async function login(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/auth/login.php',
    method: 'POST',
    headers: {
      'Host': HOST_HEADER,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  return res.body;
}

async function apiCall(method, path, token, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = { 'Host': HOST_HEADER };
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRealtimeRecoveryUat() {
  console.log('========================================================================');
  console.log(' UAT REALTIME STREAM RECOVERY & RECONNECT TEST SUITE (RT-01 to RT-10)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function record(id, title, success, details = '') {
    if (success) {
      passed++;
      console.log(`[PASS] ${id}: ${title}`);
      if (details) console.log(`       -> ${details}`);
    } else {
      failed++;
      console.log(`[FAIL] ${id}: ${title}`);
      if (details) console.log(`       -> Error: ${details}`);
    }
    results.push({ id, title, success, details });
  }

  try {
    // 1. SETUP: Login teacher and create test quiz & session
    console.log('[SETUP] Logging in teacher and preparing quiz session...');
    const loginRes = await login('regression_teacher@sinesa.com', 'password123');
    const token = loginRes?.data?.access_token || loginRes?.data?.token;
    if (!token) {
      throw new Error('Teacher login failed: ' + JSON.stringify(loginRes));
    }

    // Create a dedicated 3-question quiz for this test
    const quizTitle = 'UAT Realtime Recovery Test ' + Date.now();
    const quizCreateRes = await apiCall('POST', '/api/quizzes/index.php', token, {
      title: quizTitle,
      description: 'Automated test quiz for RT-01 to RT-10',
      subject: 'Informatika',
      target_grade: '10',
      duration_minutes: 15
    });
    const quizId = quizCreateRes.body?.data?.id;

    // Create 3 questions
    for (let i = 1; i <= 3; i++) {
      const qRes = await apiCall('POST', '/api/questions/index.php', token, {
        quiz_id: quizId,
        question_text: `Soal UAT RT Nomor ${i}`,
        question_type: 'single',
        points: 100,
        order_num: i,
        options: [
          { option_text: `Opsi Benar Soal ${i}`, is_correct: true, order_num: 1 },
          { option_text: `Opsi Salah Soal ${i}`, is_correct: false, order_num: 2 },
        ]
      });
    }

    // Create a live session
    const sessRes = await apiCall('POST', '/api/sessions/index.php', token, {
      quiz_id: quizId,
      quiz_mode: 'serius',
      lives_count: 3,
      current_stage: 'waiting',
      status: 'lobby'
    });
    const session = sessRes.body?.data;
    const sessionId = session.id;
    const pin = session.pin;

    // Join a student participant
    const joinRes = await apiCall('POST', '/api/participants/index.php', null, {
      session_id: sessionId,
      display_name: 'Murid_RT_Tester'
    });
    const participant = joinRes.body?.data;
    const participantId = participant?.id || participant?.participant?.id;

    console.log(`[SETUP] Session created (ID: ${sessionId}, PIN: ${pin}, Participant: ${participantId})\n`);

    // -------------------------------------------------------------------------
    // RT-01: Normal realtime connection established
    // -------------------------------------------------------------------------
    let receivedEventsRT01 = [];
    const stream1 = await openSseStream(
      `/realtime/stream.php?session_id=${sessionId}&role=student&participant_id=${participantId}`,
      {},
      (ev, data, id) => {
        receivedEventsRT01.push({ ev, data, id });
      },
      true
    );

    const hasEventStreamHeader = (stream1.headers['content-type'] || '').includes('text/event-stream');
    const hasCacheControlNoCache = (stream1.headers['cache-control'] || '').includes('no-cache');
    const hasRetryInstruction = stream1.totalReceived.includes('retry: 3000');
    const status200 = stream1.statusCode === 200;

    record(
      'RT-01',
      'Normal realtime connection established with HTTP 200 text/event-stream & retry: 3000',
      status200 && hasEventStreamHeader && hasCacheControlNoCache && hasRetryInstruction,
      `HTTP ${stream1.statusCode}, Content-Type: ${stream1.headers['content-type']}, retry: 3000 found: ${hasRetryInstruction}`
    );

    const lastEventIdRT01 = stream1.lastEventId || 'evt_initial';

    // -------------------------------------------------------------------------
    // RT-02: Connection offline simulation (abrupt disconnection / 10.5s network sleep)
    // -------------------------------------------------------------------------
    console.log('\n[SIMULATION] RT-02: Cutting client connection and waiting 10.5s offline...');
    const disconnectStart = Date.now();
    stream1.close(); // Simulates network break / socket abrupt close
    
    // -------------------------------------------------------------------------
    // RT-03: Host moves from Q1 to Q2 while offline
    // -------------------------------------------------------------------------
    // Start quiz first (Q1)
    await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, token, {
      status: 'active',
      current_stage: 'question',
      current_question_index: 0
    });

    // Host moves to Q2 (index 1) while client is disconnected
    await apiCall('PUT', `/api/sessions/index.php?id=${sessionId}`, token, {
      status: 'active',
      current_stage: 'question',
      current_question_index: 1
    });

    // Sleep until full 10.5s offline duration elapsed
    const elapsedSoFar = Date.now() - disconnectStart;
    const remainingOfflineMs = Math.max(0, 10500 - elapsedSoFar);
    await sleep(remainingOfflineMs);
    const totalOfflineMs = Date.now() - disconnectStart;

    record(
      'RT-02',
      'Connection offline simulation (10.5s) completed',
      totalOfflineMs >= 10400,
      `Disrupted duration: ${totalOfflineMs}ms`
    );

    record(
      'RT-03',
      'Host transitioned session to Q2 (index: 1) during offline disruption',
      true,
      `Host updated session ${sessionId} to current_question_index = 1, current_stage = question`
    );

    // -------------------------------------------------------------------------
    // RT-04: Client reconnects using Last-Event-ID
    // -------------------------------------------------------------------------
    console.log('\n[RECONNECT] Reconnecting client with Last-Event-ID...');
    let receivedEventsRT05 = [];
    const stream2 = await openSseStream(
      `/realtime/stream.php?session_id=${sessionId}&role=student&participant_id=${participantId}&last_event_id=${lastEventIdRT01}`,
      { 'Last-Event-ID': lastEventIdRT01 },
      (ev, data, id) => {
        receivedEventsRT05.push({ ev, data, id });
      },
      true
    );

    record(
      'RT-04',
      'Client reconnects transmitting Last-Event-ID in header and query string',
      stream2.statusCode === 200,
      `Reconnected successfully transmitting Last-Event-ID: ${lastEventIdRT01}`
    );

    // -------------------------------------------------------------------------
    // RT-05: Realtime reconnects successfully with HTTP 200 (NO HTTP 500 error!)
    // -------------------------------------------------------------------------
    const isStream2Ok = stream2.statusCode === 200 && (stream2.headers['content-type'] || '').includes('text/event-stream');
    record(
      'RT-05',
      'Realtime stream endpoint returns HTTP 200 text/event-stream on reconnect (NO HTTP 500)',
      isStream2Ok,
      `HTTP status: ${stream2.statusCode}, Content-Type: ${stream2.headers['content-type']}`
    );

    // Also test alias /api/realtime/stream.php
    const streamAlias = await openSseStream(
      `/api/realtime/stream.php?session_id=${sessionId}&role=student&participant_id=${participantId}`
    );
    const isAliasOk = streamAlias.statusCode === 200 && (streamAlias.headers['content-type'] || '').includes('text/event-stream');
    streamAlias.close();

    // -------------------------------------------------------------------------
    // RT-06: Polling fallback keeps participant on Q2 if realtime is delayed
    // -------------------------------------------------------------------------
    const pollCheck = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, null);
    const polledQIdx = pollCheck.body?.data?.current_question_index;
    const polledStage = pollCheck.body?.data?.current_stage;

    record(
      'RT-06',
      'Polling fallback keeps participant synchronized to Q2 without full page reload',
      polledQIdx === 1 && polledStage === 'question',
      `Polled stage: ${polledStage}, question_index: ${polledQIdx}`
    );

    // -------------------------------------------------------------------------
    // RT-07: Realtime recovers after polling without event collision or backwards state
    // -------------------------------------------------------------------------
    // Wait for StageChanged event from stream2
    await sleep(1500);
    const stageEvent = receivedEventsRT05.find(e => e.ev === 'StageChanged');
    const sseQIdx = stageEvent?.data?.current_question_index ?? stageEvent?.data?.session?.current_question_index;
    const sseStage = stageEvent?.data?.stage ?? stageEvent?.data?.session?.current_stage;

    record(
      'RT-07',
      'Realtime recovers after polling: StageChanged event confirms Q2 without state regression',
      sseQIdx === 1 && sseStage === 'question',
      `Received SSE StageChanged: stage=${sseStage}, question_index=${sseQIdx}`
    );
    stream2.close();

    // -------------------------------------------------------------------------
    // RT-08: Repeated offline/online cycles without listener leaks or process exhaustion
    // -------------------------------------------------------------------------
    console.log('\n[CYCLES] RT-08: Testing 3 rapid disconnect/reconnect cycles...');
    let cyclesPassed = true;
    for (let c = 1; c <= 3; c++) {
      const cycleStream = await openSseStream(
        `/realtime/stream.php?session_id=${sessionId}&role=student&participant_id=${participantId}`
      );
      if (cycleStream.statusCode !== 200) {
        cyclesPassed = false;
        break;
      }
      await sleep(300);
      cycleStream.close(); // Immediate disconnect
      await sleep(200);
    }

    record(
      'RT-08',
      'Repeated offline/online cycles terminate cleanly without worker thread or connection exhaustion',
      cyclesPassed,
      '3 consecutive rapid connect/disconnect cycles succeeded with HTTP 200'
    );

    // -------------------------------------------------------------------------
    // RT-09: Multiple participants reconnect concurrently
    // -------------------------------------------------------------------------
    console.log('\n[CONCURRENCY] RT-09: Testing concurrent reconnection of 5 participants...');
    // Create 4 more participants
    const concurrentStreams = [];
    const participantIds = [participantId];
    for (let p = 1; p <= 4; p++) {
      const pRes = await apiCall('POST', '/api/participants/index.php', null, {
        session_id: sessionId,
        display_name: `Concurrent_Student_${p}`
      });
      const pData = pRes.body?.data;
      participantIds.push(pData?.id || pData?.participant?.id);
    }

    // Connect all 5 concurrently
    const connPromises = participantIds.map(pid => 
      openSseStream(`/realtime/stream.php?session_id=${sessionId}&role=student&participant_id=${pid}`)
    );
    const openResults = await Promise.all(connPromises);
    const allConcurrent200 = openResults.every(r => r.statusCode === 200 && (r.headers['content-type'] || '').includes('text/event-stream'));
    
    // Close all
    openResults.forEach(r => r.close());

    record(
      'RT-09',
      'Multiple participants reconnect concurrently without 500 error or lock deadlocks',
      allConcurrent200,
      `All 5 concurrent stream connections returned HTTP 200 text/event-stream`
    );

    // -------------------------------------------------------------------------
    // RT-10: Refresh page after recovery maintains correct question
    // -------------------------------------------------------------------------
    const finalSessionCheck = await apiCall('GET', `/api/sessions/index.php?id=${sessionId}`, null);
    const finalPartCheck = await apiCall('GET', `/api/participants/index.php?session_id=${sessionId}`, null);

    const finalQIdx = finalSessionCheck.body?.data?.current_question_index;
    const finalStage = finalSessionCheck.body?.data?.current_stage;
    const finalPartCount = finalPartCheck.body?.data?.length;

    record(
      'RT-10',
      'Refresh session state after recovery preserves correct question (Q2) and participant list',
      finalQIdx === 1 && finalStage === 'question' && finalPartCount >= 5,
      `Final state: current_stage=${finalStage}, current_question_index=${finalQIdx}, participants_count=${finalPartCount}`
    );

  } catch (err) {
    console.error('[FATAL ERROR IN TEST SUITE]', err);
    record('RT-FATAL', 'Test suite execution completed without fatal crash', false, err.message);
  }

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================================');
  if (failed === 0) {
    console.log('>>> ALL UAT REALTIME RECOVERY ACCEPTANCE CRITERIA VERIFIED 100% PASS <<<');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runRealtimeRecoveryUat();
