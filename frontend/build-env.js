#!/usr/bin/env node
/**
 * WildShield AI — Frontend Subdirectory Environment Builder
 * Injects Vercel environment variables directly into env-config.js
 */
const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'env-config.js');

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
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log(`[WildShield Frontend Build] Successfully wrote env-config.js (API_URL="${apiUrl || '(fallback to localhost/relative)'}")`);
} catch (err) {
  console.error('[WildShield Frontend Build] Error generating env-config.js:', err);
  process.exit(1);
}
