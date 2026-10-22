/**
 * Regression Test Suite: Logout & Token Invalidation
 * SINESA Backend API
 *
 * Verifies:
 * 1. Active access token works on /api/auth/me (HTTP 200)
 * 2. Successful logout revokes access token and refresh token in backend database
 * 3. Old access token is rejected on /api/auth/me with HTTP 401
 * 4. Old refresh token is rejected on /api/auth/refresh with HTTP 401 (Cookie & Body)
 * 5. Concurrent user sessions remain active (no collateral revocation)
 * 6. User can re-login successfully and new access token works (HTTP 200)
 * 7. Rapid re-login within the same second generates unique jti and is not falsely revoked
 */

const assert = require('assert');

const BASE_URL = process.env.API_BASE_URL || 'http://evaluasi-bakcip.test/api';

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), raw: text };
  } catch (e) {
    return { status: res.status, data: null, raw: text };
  }
}

function extractCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

async function runTests() {
  console.log('====================================================');
  console.log(' SINESA REGRESSION TEST: Logout & Token Invalidation');
  console.log(` Target API: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName, details) {
    passed++;
    console.log(`[PASS] ${testName}`);
    if (details) console.log(`       -> ${details}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`[FAIL] ${testName}`);
    console.error(`       -> ${err.message || err}`);
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Login User A (Student) and verify initial active session
    // -----------------------------------------------------------------
    console.log('--- Test 1: User A Login & Active Token Verification ---');
    const loginARes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'budi_test@sinesa.com', password: 'password123' })
    });
    const loginA = await parseJsonResponse(loginARes);
    assert.strictEqual(loginA.status, 200, `Expected 200, got ${loginA.status}: ${loginA.raw}`);
    assert.strictEqual(loginA.data?.success, true, 'Login should succeed');
    
    const userAAccessToken = loginA.data?.data?.access_token;
    assert.ok(userAAccessToken, 'Should return access_token');
    
    const setCookieHeaderA = loginARes.headers.get('set-cookie');
    const userARefreshToken = extractCookie(setCookieHeaderA, 'sinesa_refresh_token');
    assert.ok(userARefreshToken, 'Should set sinesa_refresh_token cookie');

    // Verify GET /api/auth/me returns 200 for User A
    const meARes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${userAAccessToken}` }
    });
    const meA = await parseJsonResponse(meARes);
    assert.strictEqual(meA.status, 200, `Expected 200 on /me, got ${meA.status}`);
    assert.strictEqual(meA.data?.success, true);
    assert.strictEqual(meA.data?.data?.user?.email, 'budi_test@sinesa.com');
    recordPass('Test 1: User A login & active token validation', `Status 200, user: ${meA.data.data.user.email}`);

    // -----------------------------------------------------------------
    // TEST 2: Concurrent Session Isolation (User B - Teacher)
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: User B Login (Session Isolation Setup) ---');
    const loginBRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'regression_teacher@sinesa.com', password: 'password123' })
    });
    const loginB = await parseJsonResponse(loginBRes);
    assert.strictEqual(loginB.status, 200, `Expected 200 for User B, got ${loginB.status}`);
    const userBAccessToken = loginB.data?.data?.access_token;
    assert.ok(userBAccessToken, 'User B should receive access_token');
    recordPass('Test 2: User B session setup', 'Teacher session established');

    // -----------------------------------------------------------------
    // TEST 3: Logout User A
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Logout User A via /api/auth/logout ---');
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userAAccessToken}`,
        'Content-Type': 'application/json',
        'Cookie': `sinesa_refresh_token=${userARefreshToken}`
      },
      body: JSON.stringify({
        access_token: userAAccessToken,
        refresh_token: userARefreshToken
      })
    });
    const logoutData = await parseJsonResponse(logoutRes);
    assert.strictEqual(logoutData.status, 200, `Expected 200 on logout, got ${logoutData.status}: ${logoutData.raw}`);
    assert.strictEqual(logoutData.data?.success, true);
    recordPass('Test 3: Logout User A execution', 'Backend successfully processed revocation');

    // -----------------------------------------------------------------
    // TEST 4: Reuse Revoked Access Token on /api/auth/me (MUST RETURN 401)
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Reuse Revoked Access Token on /api/auth/me ---');
    const revokedMeRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${userAAccessToken}` }
    });
    const revokedMe = await parseJsonResponse(revokedMeRes);
    assert.strictEqual(
      revokedMe.status,
      401,
      `SECURITY VULNERABILITY: Revoked token was accepted with status ${revokedMe.status}! Response: ${revokedMe.raw}`
    );
    assert.strictEqual(revokedMe.data?.success, false, 'Expected success=false');
    recordPass('Test 4: Revoked access token rejection on /api/auth/me', `Rejected with HTTP 401: "${revokedMe.data?.error}"`);

    // -----------------------------------------------------------------
    // TEST 5: Reuse Revoked Refresh Token on /api/auth/refresh (MUST RETURN 401)
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: Reuse Revoked Refresh Token on /api/auth/refresh ---');
    // 5a. Test via Cookie
    const revokedRefreshCookieRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': `sinesa_refresh_token=${userARefreshToken}`
      }
    });
    const revokedRefreshCookie = await parseJsonResponse(revokedRefreshCookieRes);
    assert.strictEqual(
      revokedRefreshCookie.status,
      401,
      `Expected 401 on revoked cookie refresh, got ${revokedRefreshCookie.status}: ${revokedRefreshCookie.raw}`
    );
    assert.strictEqual(revokedRefreshCookie.data?.success, false);

    // 5b. Test via Body
    const revokedRefreshBodyRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: userARefreshToken })
    });
    const revokedRefreshBody = await parseJsonResponse(revokedRefreshBodyRes);
    assert.strictEqual(
      revokedRefreshBody.status,
      401,
      `Expected 401 on revoked body refresh, got ${revokedRefreshBody.status}: ${revokedRefreshBody.raw}`
    );
    assert.strictEqual(revokedRefreshBody.data?.success, false);
    recordPass('Test 5: Revoked refresh token rejection (Cookie & Body)', 'Both attempts rejected with HTTP 401');

    // -----------------------------------------------------------------
    // TEST 6: User B Session Integrity (No Collateral Revocation)
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Verify User B Session Remains Valid ---');
    const meBRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${userBAccessToken}` }
    });
    const meB = await parseJsonResponse(meBRes);
    assert.strictEqual(meB.status, 200, `User B should still be active, got ${meB.status}`);
    assert.strictEqual(meB.data?.success, true);
    assert.strictEqual(meB.data?.data?.user?.email, 'regression_teacher@sinesa.com');
    recordPass('Test 6: User B session integrity preserved', 'Teacher session unaffected by student logout');

    // -----------------------------------------------------------------
    // TEST 7: User A Re-login & New Token Functionality
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: User A Re-login & Fresh Token Verification ---');
    const reloginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'budi_test@sinesa.com', password: 'password123' })
    });
    const relogin = await parseJsonResponse(reloginRes);
    assert.strictEqual(relogin.status, 200, `Expected 200 on re-login, got ${relogin.status}`);
    assert.strictEqual(relogin.data?.success, true);
    
    const newAccessToken = relogin.data?.data?.access_token;
    assert.ok(newAccessToken, 'Should receive new access_token');
    assert.notStrictEqual(newAccessToken, userAAccessToken, 'New access token should be different from revoked token');

    const newMeRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${newAccessToken}` }
    });
    const newMe = await parseJsonResponse(newMeRes);
    assert.strictEqual(newMe.status, 200, `New token should return 200 on /me, got ${newMe.status}`);
    assert.strictEqual(newMe.data?.success, true);
    recordPass('Test 7: User A re-login & fresh access token', `New token accepted with HTTP 200`);

    // -----------------------------------------------------------------
    // TEST 8: Verify Old Token STILL Rejected after Re-login
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Ensure Old Token Remains Revoked After Re-login ---');
    const oldTokenPostReloginRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${userAAccessToken}` }
    });
    const oldTokenPostRelogin = await parseJsonResponse(oldTokenPostReloginRes);
    assert.strictEqual(oldTokenPostRelogin.status, 401, 'Old token must remain rejected even after user logs in again');
    recordPass('Test 8: Old token remains permanently revoked after re-login', 'Status 401');

  } catch (err) {
    recordFail('Regression Test Execution', err);
  }

  console.log('\n====================================================');
  console.log(` RESULT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
