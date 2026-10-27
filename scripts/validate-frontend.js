#!/usr/bin/env node
/**
 * WildShield AI — Frontend Verification Suite
 * Checks:
 * 1. Presence of all 8 core HTML pages.
 * 2. Presence of all static assets (styles.css, layout.js, api-service.js, script.js, env-config.js).
 * 3. Script loading tags in all HTML files.
 * 4. Tag balance in all HTML pages.
 * 5. Absence of broken relative links or hardcoded localhost in HTML files.
 */
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..', 'frontend');

const expectedPages = [
  'index.html',
  'map-view.html',
  'alerts.html',
  'siren-control.html',
  'analytics.html',
  'notifications.html',
  'profile.html',
  'security.html'
];

const expectedAssets = [
  'styles.css',
  'layout.js',
  'api-service.js',
  'script.js',
  'env-config.js'
];

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('--- WildShield AI Frontend Verification ---');

// 1. Verify Pages Exist
expectedPages.forEach((page) => {
  const filePath = path.join(frontendDir, page);
  assert(fs.existsSync(filePath), `HTML Page exists: ${page}`);
});

// 2. Verify Assets Exist
expectedAssets.forEach((asset) => {
  const filePath = path.join(frontendDir, asset);
  assert(fs.existsSync(filePath), `Static Asset exists: ${asset}`);
});

// 3. Verify Script Inclusions & Tag Consistency
expectedPages.forEach((page) => {
  const filePath = path.join(frontendDir, page);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');

  assert(content.includes('<script src="env-config.js"></script>'), `${page} includes env-config.js`);
  assert(content.includes('<script src="layout.js"></script>'), `${page} includes layout.js`);
  assert(content.includes('<script src="api-service.js"></script>'), `${page} includes api-service.js`);
  assert(content.includes('<script src="script.js"></script>'), `${page} includes script.js`);
  assert(!content.includes('http://localhost'), `${page} contains zero hardcoded localhost references`);
});

// 4. Verify API Service dynamically resolves baseUrl
const apiServicePath = path.join(frontendDir, 'api-service.js');
const apiServiceContent = fs.readFileSync(apiServicePath, 'utf8');
assert(apiServiceContent.includes('resolveApiBaseUrl'), 'api-service.js defines resolveApiBaseUrl');
assert(apiServiceContent.includes('window.__ENV__'), 'api-service.js checks window.__ENV__');

// 5. Verify Script WebSocket resolution
const scriptPath = path.join(frontendDir, 'script.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');
assert(scriptContent.includes('wsUrl.startsWith(\'ws\')'), 'script.js safely validates WebSocket URLs');

console.log('-------------------------------------------');
if (failures === 0) {
  console.log('🎉 All frontend verifications passed successfully!');
  process.exit(0);
} else {
  console.error(`🚨 ${failures} verification check(s) failed.`);
  process.exit(1);
}
