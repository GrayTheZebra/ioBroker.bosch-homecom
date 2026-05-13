#!/usr/bin/env node
/**
 * Bosch HomeCom Easy - Interactive Login Script
 * 
 * Generates a fresh PKCE pair, shows the auth URL, waits for the code,
 * exchanges it for tokens, and saves them to ioBroker.
 *
 * Usage: node bosch-login.js [instance]
 * Example: node bosch-login.js bosch-homecom.0
 */

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const readline = require('readline');
const { execSync } = require('child_process');

const INSTANCE = process.argv[2] || 'bosch-homecom.0';
const CLIENT_ID = '762162C0-FA2D-4540-AE66-6489F189FADC';
const REDIRECT_URI = 'com.bosch.tt.dashtt.pointt://app/login';
const TOKEN_HOST = 'singlekey-id.com';
const TOKEN_PATH = '/auth/connect/token';
const SCOPES = 'openid email profile offline_access pointt.gateway.claiming pointt.gateway.removal pointt.gateway.list pointt.gateway.users pointt.gateway.resource.dashapp pointt.castt.flow.token-exchange bacon hcc.tariff.read';

// ── Generate fresh PKCE pair ──────────────────────────────────────────────────
function generatePkce() {
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ── Build authorization URL ───────────────────────────────────────────────────
function buildAuthUrl(challenge) {
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    response_type: 'code',
    prompt: 'login',
    scope: SCOPES,
    style_id: 'tt_bsch',
  });
  return `https://singlekey-id.com/auth/connect/authorize?${params.toString()}`;
}

// ── Exchange code for tokens ──────────────────────────────────────────────────
function exchangeCode(code, verifier) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });

    const options = {
      hostname: TOKEN_HOST,
      port: 443,
      path: TOKEN_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Save tokens to ioBroker ───────────────────────────────────────────────────
function saveToIoBroker(tokens) {
  const expiry = Date.now() + (tokens.expires_in * 1000);
  const native = JSON.stringify({
    native: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: expiry,
      authCode: '',
    }
  });
  const iobCmd = `sudo -u iobroker node /opt/iobroker/node_modules/iobroker.js-controller/iobroker.js`;
  try {
    execSync(`${iobCmd} object set system.adapter.${INSTANCE} '${native}'`, { stdio: 'inherit' });
    console.log('\n✓ Tokens saved to ioBroker!\n');
    execSync(`${iobCmd} restart ${INSTANCE}`, { stdio: 'inherit' });
    console.log('✓ Adapter restarted.\n');
  } catch (err) {
    console.error('\nCould not save automatically. Run this manually:\n');
    console.log(`sudo -u iobroker node /opt/iobroker/node_modules/iobroker.js-controller/iobroker.js object set system.adapter.${INSTANCE} '${native}'`);
    console.log(`\nsudo -u iobroker node /opt/iobroker/node_modules/iobroker.js-controller/iobroker.js restart ${INSTANCE}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthUrl(challenge);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Bosch HomeCom Easy - Login');
  console.log('══════════════════════════════════════════════════════════════\n');
  console.log('1. Open this URL in a PRIVATE/INCOGNITO browser window:\n');
  console.log(authUrl);
  console.log('\n2. Log in with your Bosch SingleKey ID credentials.');
  console.log('3. After login, the browser shows a redirect error — this is EXPECTED.');
  console.log('4. Open DevTools (F12) → Network tab.');
  console.log('5. Find the request to the redirect URI (filter by "pointt" or "code=").');
  console.log('6. Copy the "code" parameter value from the URL (ends in -1).\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the authorization code here and press Enter: ', async (code) => {
    rl.close();
    if (!code || !code.trim()) {
      console.error('No code entered. Aborting.');
      process.exit(1);
    }
    console.log('\nExchanging code for tokens...');
    try {
      const tokens = await exchangeCode(code.trim(), verifier);
      console.log('✓ Token exchange successful!');
      console.log(`  Access token expires in: ${tokens.expires_in}s`);
      saveToIoBroker(tokens);
    } catch (err) {
      console.error('\n✗ Token exchange failed:', err.message);
      console.error('\nPossible causes:');
      console.error('  - Code already used (each code is single-use)');
      console.error('  - Code expired (open URL and login again immediately)');
      console.error('  - Wrong code copied (make sure it ends in -1)');
      process.exit(1);
    }
  });
}

main().catch(console.error);
