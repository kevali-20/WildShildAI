#!/usr/bin/env node
/**
 * WildShield AI — Production Environment Builder
 * Injects Vercel / CI environment variables into frontend/env-config.js
 * Supported variables: VITE_API_URL, PUBLIC_API_URL, BACKEND_API_URL, API_URL
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const targetFile = path.join(frontendDir, 'env-config.js');

const rawApiUrl =
  process.env.VITE_API_URL ||
  process.env.PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.API_URL ||
  '';

const apiUrl = rawApiUrl.trim().replace(/\/+$/, '');

const content = `// Runtime environment configuration for WildShield AI
// Automatically generated during build. Do not edit manually.
window.__ENV__ = Object.assign(window.__ENV__ || {}, {
  API_URL: ${JSON.stringify(apiUrl)}
});
`;

try {
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log(`[WildShield Build] Successfully wrote env-config.js (API_URL="${apiUrl || '(fallback to localhost/relative)'}")`);
} catch (err) {
  console.error('[WildShield Build] Error generating env-config.js:', err);
  process.exit(1);
}
