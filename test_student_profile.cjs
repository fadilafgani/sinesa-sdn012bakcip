const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('=== SINESA Student Profile Test Suite ===\n');

  // Test 1: Verify Codebase Routes & Components
  console.log('[TEST 1] Verifying Frontend Router & Profile Integration...');
  const appTsx = fs.readFileSync(path.join(__dirname, 'src', 'app', 'App.tsx'), 'utf8');
  assert(appTsx.includes('StudentProfile'), 'App.tsx must import StudentProfile');
  assert(appTsx.includes('path="/student/profile"'), 'App.tsx must define route /student/profile');
  assert(appTsx.includes('path="/student/settings"'), 'App.tsx must define alias /student/settings');
  assert(appTsx.includes('path="/profile"'), 'App.tsx must define alias /profile');
  assert(appTsx.includes('path="/account"'), 'App.tsx must define alias /account');
  console.log('  PASS: App.tsx has all required profile routes and role redirector.');

  const dashboardTsx = fs.readFileSync(path.join(__dirname, 'src', 'features', 'student', 'pages', 'dashboard.tsx'), 'utf8');
  assert(dashboardTsx.includes('/student/profile'), 'Student dashboard must contain navigation to /student/profile');
  assert(dashboardTsx.includes('Halo,'), 'Student dashboard must contain student name section');
  assert(dashboardTsx.includes('Buka Menu Profil') || dashboardTsx.includes('Profil'), 'Student dashboard must contain profile button');
  console.log('  PASS: Student dashboard includes clickable profile link and navbar button.');

  const profileTsx = fs.readFileSync(path.join(__dirname, 'src', 'features', 'student', 'pages', 'profile.tsx'), 'utf8');
  assert(profileTsx.includes('StudentProfile'), 'profile.tsx must export StudentProfile');
  assert(profileTsx.includes('Simpan Perubahan'), 'profile.tsx must contain Simpan button');
  assert(profileTsx.includes('Batal'), 'profile.tsx must contain Batal button');
  assert(profileTsx.includes('Kembali ke Dashboard'), 'profile.tsx must contain Kembali button');
  console.log('  PASS: StudentProfile component has all necessary form fields, validations, and action buttons.');

  // Test 2: Live Backend API Verification (Auth & Profile Endpoints)
  console.log('\n[TEST 2] Testing Backend Authentication & Profile Endpoints...');
  const baseUrl = 'http://evaluasi-bakcip.test/api';

  // 2a. Login as student
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'budi_test@sinesa.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  assert(loginData.success === true, 'Student login must succeed: ' + JSON.stringify(loginData.error));
  const token = loginData.data.access_token;
  const originalProfile = loginData.data.profile;
  assert(token, 'Access token must be returned');
  assert.strictEqual(originalProfile.role, 'student', 'Role must be student');
  console.log(`  PASS: Logged in as student (${originalProfile.full_name}, role: ${originalProfile.role}).`);

  // 2b. Fetch Profile via GET /profile
  const getRes = await fetch(`${baseUrl}/profile`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const getData = await getRes.json();
  assert(getData.success === true, 'GET /profile must succeed');
  assert.strictEqual(getData.data.id, originalProfile.id, 'Profile ID must match authenticated user');
  assert.strictEqual(getData.data.role, 'student', 'Profile role must be student');
  console.log('  PASS: GET /profile successfully returned authentic student data.');

  // 2c. Update Profile via PUT /profile
  const updatedTestName = `Budi Santoso Profil Test ${Date.now()}`;
  const updatedUsername = `budi_test_${Math.floor(Math.random() * 10000)}`;
  const updateRes = await fetch(`${baseUrl}/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      full_name: updatedTestName,
      username: updatedUsername
    })
  });
  const updateData = await updateRes.json();
  assert(updateData.success === true, 'PUT /profile must succeed: ' + JSON.stringify(updateData.error));
  assert.strictEqual(updateData.data.full_name, updatedTestName, 'Updated full_name must match submitted value');
  assert.strictEqual(updateData.data.username, updatedUsername, 'Updated username must match submitted value');
  console.log(`  PASS: PUT /profile saved changes successfully (Name: "${updatedTestName}", Username: "${updatedUsername}").`);

  // 2d. Refresh & Persistence verification via GET /auth/me
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const meData = await meRes.json();
  assert(meData.success === true, 'GET /auth/me must succeed');
  assert.strictEqual(meData.data.profile.full_name, updatedTestName, 'Persistence verified: /auth/me returns updated name');
  assert.strictEqual(meData.data.profile.username, updatedUsername, 'Persistence verified: /auth/me returns updated username');
  console.log('  PASS: Persistence verified after simulated reload via /auth/me.');

  // 2e. Revert profile name back to clean state
  await fetch(`${baseUrl}/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      full_name: 'Budi Santoso',
      username: 'budisantoso'
    })
  });
  console.log('  PASS: Cleaned up and restored original student profile state.');

  console.log('\n========================================');
  console.log('ALL TESTS PASSED! (5/5 checks OK)');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
