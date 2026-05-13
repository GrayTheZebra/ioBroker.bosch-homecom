#!/usr/bin/env node
/**
 * Standalone token exchange script.
 * Usage: node exchange-code.js <AUTH_CODE>
 * 
 * Run this IMMEDIATELY after copying the code from the browser.
 * The code expires within seconds!
 */

const https = require('https');
const querystring = require('querystring');

const CLIENT_ID = '762162C0-FA2D-4540-AE66-6489F189FADC';
const REDIRECT_URI = 'com.bosch.tt.dashtt.pointt://app/login';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const TOKEN_URL = 'singlekey-id.com';
const TOKEN_PATH = '/auth/connect/token';

const code = process.argv[2];
if (!code) {
  console.error('Usage: node exchange-code.js <AUTH_CODE>');
  process.exit(1);
}

const postData = querystring.stringify({
  grant_type: 'authorization_code',
  code: code.trim(),
  redirect_uri: REDIRECT_URI,
  client_id: CLIENT_ID,
  code_verifier: CODE_VERIFIER,
});

const options = {
  hostname: TOKEN_URL,
  port: 443,
  path: TOKEN_PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log('Exchanging code...');
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      const tokens = JSON.parse(data);
      console.log('\n✓ SUCCESS! Tokens received.\n');
      console.log('ACCESS_TOKEN:', tokens.access_token);
      console.log('\nREFRESH_TOKEN:', tokens.refresh_token);
      console.log('\nEXPIRES_IN:', tokens.expires_in, 'seconds');
      console.log('\n--- Now run this command to save tokens to ioBroker ---\n');
      const expiry = Date.now() + (tokens.expires_in * 1000);
      console.log(`sudo -u iobroker node /opt/iobroker/node_modules/iobroker.js-controller/iobroker.js object set system.adapter.bosch-homecom.0 '{"native":{"accessToken":"${tokens.access_token}","refreshToken":"${tokens.refresh_token}","tokenExpiry":${expiry},"authCode":""}}'`);
      console.log('\nThen restart: sudo -u iobroker node /opt/iobroker/node_modules/iobroker.js-controller/iobroker.js restart bosch-homecom.0\n');
    } else {
      console.error('✗ FAILED:', res.statusCode, data);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e));
req.write(postData);
req.end();
