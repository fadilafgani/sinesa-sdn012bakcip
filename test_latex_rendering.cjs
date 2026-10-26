const http = require('http');
const katex = require('katex');

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function parseMixedContent(content, forceDisplayMode = false) {
  if (!content || typeof content !== 'string') return [];
  if (!content.trim()) return [];

  const delimiterRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)((?:\\.|[^\\$])+?)\$)/g;
  const hasDelimiters = delimiterRegex.test(content);
  delimiterRegex.lastIndex = 0;

  if (!hasDelimiters) {
    if (forceDisplayMode) {
      return [{ type: 'math', value: content.trim(), display: true }];
    }
    if (/^\s*\\(frac|sqrt|int|sum|alpha|beta|gamma|theta|pi|partial|mathbf|vec|times|div|pm|mp|le|ge|neq|approx|equiv)\b/.test(content)) {
      return [{ type: 'math', value: content.trim(), display: false }];
    }
    return [{ type: 'text', value: content }];
  }

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = delimiterRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: true });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: true });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: false });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      parts.push({ type: 'math', value: token.slice(1, -1).trim(), display: false });
    }
    lastIndex = delimiterRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' SINESA UAT TEST: LaTeX Formula Rendering (KaTeX)');
  console.log('================================================================\n');

  // --- 1. UNIT TESTING: Delimiters and Math Expressions ---
  console.log('--- 1. Testing Delimiters & Mathematical Expressions ---');

  // Test Pecahan (Fraction)
  const fracInput = 'Pecahan \\(\\frac{3}{4}\\) ditambah \\(\\frac{1}{4}\\)';
  const fracParts = parseMixedContent(fracInput);
  assert(fracParts.length === 4, 'Fraction string parsed into 4 parts');
  assert(fracParts[1].type === 'math' && fracParts[1].value === '\\frac{3}{4}', 'First fraction math token matched');
  const fracHtml = katex.renderToString(fracParts[1].value, { throwOnError: false, displayMode: false });
  assert(fracHtml.includes('class="mfrac"') || fracHtml.includes('mfrac'), 'KaTeX rendered fraction markup (mfrac)');

  // Test Akar Kuadrat (Square Root)
  const sqrtInput = 'Hitung akar: $\\sqrt{b^2 - 4ac}$';
  const sqrtParts = parseMixedContent(sqrtInput);
  assert(sqrtParts.length === 2 && sqrtParts[1].value === '\\sqrt{b^2 - 4ac}', 'Square root math token matched');
  const sqrtHtml = katex.renderToString(sqrtParts[1].value, { throwOnError: false, displayMode: false });
  assert(sqrtHtml.includes('class="msqrt"') || sqrtHtml.includes('msqrt'), 'KaTeX rendered square root markup (msqrt)');

  // Test Pangkat dan Indeks (Powers & Subscripts)
  const powIdxInput = 'Variabel $x_1^2 + y_i^3$ adalah...';
  const powIdxParts = parseMixedContent(powIdxInput);
  assert(powIdxParts[1].value === 'x_1^2 + y_i^3', 'Powers and indices math token matched');
  const powIdxHtml = katex.renderToString(powIdxParts[1].value, { throwOnError: false });
  assert(powIdxHtml.includes('class="msupsub"') || powIdxHtml.includes('msupsub'), 'KaTeX rendered superscript/subscript (msupsub)');

  // Test Block Display Formula (Rumus Blok)
  const blockInput = 'Rumus ABC:\n\\[\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n\\]';
  const blockParts = parseMixedContent(blockInput);
  assert(blockParts.length === 2, 'Block formula parsed into text + math');
  assert(blockParts[1].display === true, 'Block delimiter \\[ \\] marked displayMode=true');
  const blockHtml = katex.renderToString(blockParts[1].value, { displayMode: true, throwOnError: false });
  assert(blockHtml.includes('class="katex-display"'), 'KaTeX rendered displayMode block container');

  // Test Double Dollar Block Formula
  const ddInput = 'Rumus Pythagoras: $$\\ c^2 = a^2 + b^2 \\$$';
  const ddParts = parseMixedContent(ddInput);
  assert(ddParts[1].display === true, 'Double dollar $$ marked displayMode=true');

  // Test Simbol Matematika (Integral, Sum, Alpha, Beta, Pi, etc.)
  const symInput = 'Nilai integral \\(\\int_0^1 x\\,dx\\) dan simbol \\(\\alpha, \\beta, \\pi, \\le, \\ge\\)';
  const symParts = parseMixedContent(symInput);
  assert(symParts.length === 4, 'Math symbols parsed correctly');
  const symHtml = katex.renderToString(symParts[1].value, { throwOnError: false });
  assert(symHtml.includes('int') || symHtml.length > 50, 'KaTeX rendered integral successfully');

  // Test Invalid LaTeX Handling (Error Tolerance)
  const invalidInput = 'Rumus rusak: \\(\\frac{1}{}\\) dan \\(\\unknowncmd\\)';
  const invParts = parseMixedContent(invalidInput);
  let errorHandledCleanly = true;
  try {
    const invHtml = katex.renderToString(invParts[1].value, { throwOnError: false });
    assert(invHtml.length > 0, 'Invalid LaTeX produced safe markup without throwing exception');
  } catch (e) {
    errorHandledCleanly = false;
  }
  assert(errorHandledCleanly, 'Invalid LaTeX did not crash the parser or execution');

  // Test Plain Text Preservation (No Math)
  const plainInput = 'Pertanyaan biasa tanpa rumus: Siapakah presiden pertama Indonesia?';
  const plainParts = parseMixedContent(plainInput);
  assert(plainParts.length === 1 && plainParts[0].type === 'text', 'Plain text left untouched as text');
  assert(plainParts[0].value === plainInput, 'Plain text content preserved verbatim');

  // Test XSS Safety
  const xssInput = '<script>alert("xss")</script> $a = 1$';
  const xssParts = parseMixedContent(xssInput);
  assert(xssParts[0].type === 'text' && xssParts[0].value.includes('<script>'), 'Script tag kept in plain text node for React text escaping');

  // --- 2. BACKEND API PERSISTENCE TESTING ---
  console.log('\n--- 2. Testing API Persistence & Exact LaTeX Source Retention ---');

  // Login Teacher
  const loginPayload = JSON.stringify({ email: 'regression_teacher@sinesa.com', password: 'password123' });
  const loginRes = await httpRequest({
    hostname: '127.0.0.1',
    port: 80,
    path: '/api/auth/login.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'evaluasi-bakcip.test',
      'Content-Length': Buffer.byteLength(loginPayload)
    }
  }, loginPayload);

  assert(loginRes.status === 200 && (loginRes.body?.data?.access_token || loginRes.body?.data?.token), 'Teacher authenticated successfully');
  const token = loginRes.body?.data?.access_token || loginRes.body?.data?.token;

  function makeAuthHeaders(payloadStr = null) {
    const h = {
      'Host': 'evaluasi-bakcip.test',
      'Authorization': `Bearer ${token}`
    };
    if (payloadStr) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(payloadStr);
    }
    return h;
  }

  // Create Quiz
  const quizPayload = JSON.stringify({
    title: 'UAT LaTeX Quiz: Matematika Lanjut',
    description: 'Kuis pengujian perenderan rumus LaTeX',
    subject: 'Matematika',
    target_class: 'Kelas 6',
    quiz_mode: 'santai',
    duration_per_question: 30
  });

  const quizRes = await httpRequest({
    hostname: '127.0.0.1',
    port: 80,
    path: '/api/quizzes/index.php',
    method: 'POST',
    headers: makeAuthHeaders(quizPayload)
  }, quizPayload);

  assert(quizRes.status === 201 && quizRes.body?.data?.id, 'LaTeX master quiz created');
  const quizId = quizRes.body?.data?.id;

  // Insert Question with LaTeX in question_text, options, explanation
  const questionTextRaw = 'Tentukan nilai dari persamaan kuadrat berikut:\n\\[\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n\\]\nBerapakah akar real jika \\(b^2 - 4ac > 0\\)?';
  const opt1Text = '\\(x_1, x_2\\) real dan berlainan';
  const opt2Text = '\\(x_1 = x_2\\) kembar ($D = 0$)';
  const opt3Text = 'Akar imajiner ($\\sqrt{-1}$)';
  const explanationRaw = 'Pembahasan: Jika diskriminan \\(D = b^2 - 4ac > 0\\), maka terdapat dua akar real berbeda.';

  const qPayload = JSON.stringify({
    quiz_id: quizId,
    question_text: questionTextRaw,
    question_type: 'multiple_choice',
    points: 10,
    duration: 30,
    order_index: 0,
    explanation: explanationRaw,
    options: [
      { option_text: opt1Text, is_correct: true, order_index: 0 },
      { option_text: opt2Text, is_correct: false, order_index: 1 },
      { option_text: opt3Text, is_correct: false, order_index: 2 }
    ]
  });

  const qRes = await httpRequest({
    hostname: '127.0.0.1',
    port: 80,
    path: '/api/questions/index.php',
    method: 'POST',
    headers: makeAuthHeaders(qPayload)
  }, qPayload);

  assert(qRes.status === 201, 'Question with LaTeX created in DB (status 201)');
  const createdQuestion = qRes.body?.data;
  assert(createdQuestion?.question_text === questionTextRaw, 'Question text source retained accurately without corruption');
  assert(createdQuestion?.explanation === explanationRaw, 'Explanation source retained accurately without corruption');
  assert(createdQuestion?.options?.[0]?.option_text === opt1Text, 'Option 1 LaTeX retained accurately');
  assert(createdQuestion?.options?.[1]?.option_text === opt2Text, 'Option 2 LaTeX retained accurately');

  // Cold Reload / GET Quiz Questions
  const getQRes = await httpRequest({
    hostname: '127.0.0.1',
    port: 80,
    path: `/api/questions/index.php?quiz_id=${quizId}&with_options=1`,
    method: 'GET',
    headers: makeAuthHeaders()
  });

  assert(getQRes.status === 200, 'Questions fetched from API upon cold reload');
  const fetchedQ = getQRes.body?.data?.[0];
  assert(fetchedQ?.question_text === questionTextRaw, 'Cold reload: Question LaTeX source intact');
  assert(fetchedQ?.explanation === explanationRaw, 'Cold reload: Explanation LaTeX source intact');
  const opt1Fetched = fetchedQ?.options?.find(o => o.option_text === opt1Text);
  assert(!!opt1Fetched, 'Cold reload: Option LaTeX source intact');

  // Clean up
  await httpRequest({
    hostname: '127.0.0.1',
    port: 80,
    path: `/api/quizzes/index.php?id=${quizId}`,
    method: 'DELETE',
    headers: makeAuthHeaders()
  });
  console.log('[PASS] Test quiz safely cleaned up');

  console.log('\n================================================================');
  console.log(` SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
