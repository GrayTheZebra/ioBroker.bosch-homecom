import crypto from 'node:crypto';
import axios from 'axios';
import type { TokenResponse, StoredTokens } from './types';

// ─── Bosch SingleKey ID OAuth2 constants ─────────────────────────────────────
const AUTH_BASE = 'https://singlekey-id.com/auth/connect';
const TOKEN_URL = `${AUTH_BASE}/token`;

// Fixed PKCE verifier from homecom_alt library (matches the fixed challenge in the auth URL)
const OAUTH_BROWSER_VERIFIER = 'AZbpLzMvXigq_jz7_riwNDV8BQYT30prXGDyRHdQMo0GYre3si9YJfG4b1U-QWERtOiX_9mCJE2SAPvJMeM2yA';
const OAUTH_BROWSER_CHALLENGE = 'Fc6eY3uMBJkFqa4VqcULuLuKC5Do70XMw7oa_Pxafw0';
const CLIENT_ID = '762162C0-FA2D-4540-AE66-6489F189FADC';
const REDIRECT_URI = 'com.bosch.tt.dashtt.pointt://app/login';
const SCOPES = [
  'openid', 'email', 'profile', 'offline_access',
  'pointt.gateway.claiming', 'pointt.gateway.removal',
  'pointt.gateway.list', 'pointt.gateway.users',
  'pointt.gateway.resource.dashapp',
  'pointt.castt.flow.token-exchange',
  'bacon', 'hcc.tariff.read',
].join(' ');

export type LogFn = (msg: string) => void;

export class AuthManager {
  private accessToken = '';
  private refreshToken = '';
  private tokenExpiry = 0; // unix ms

  constructor(
    private readonly log: { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn },
    private readonly onTokensUpdated: (tokens: StoredTokens) => Promise<void>,
  ) {}

  // ─── Restore persisted tokens ───────────────────────────────────────────

  restoreTokens(tokens: StoredTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = tokens.tokenExpiry;
    this.log.debug(`[Auth] Tokens restored, expiry: ${new Date(this.tokenExpiry).toISOString()}`);
  }

  hasTokens(): boolean {
    return !!this.refreshToken;
  }

  // ─── Step 1: generate authorization URL with fixed PKCE challenge ───────────
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      state: crypto.randomBytes(16).toString('base64url'),
      nonce: crypto.randomBytes(16).toString('base64url'),
      code_challenge: OAUTH_BROWSER_CHALLENGE,
      code_challenge_method: 'S256',
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      response_type: 'code',
      prompt: 'login',
      scope: SCOPES,
      style_id: 'tt_bsch',
    });
    return `${AUTH_BASE}/authorize?${params.toString()}`;
  }

  // ─── Step 2: exchange auth code for tokens ───────────────────────────────

  async exchangeCode(code: string, verifier?: string): Promise<void> {
    this.log.info('[Auth] Exchanging authorization code for tokens...');
    try {
      const response = await axios.post<TokenResponse>(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: verifier || OAUTH_BROWSER_VERIFIER,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      await this.storeTokenResponse(response.data);
      this.log.info('[Auth] Token exchange successful.');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : String(err);
      this.log.error(`[Auth] Token exchange failed: ${msg}`);
      throw err;
    }
  }

  // ─── Token refresh ───────────────────────────────────────────────────────

  async refreshTokens(): Promise<void> {
    if (!this.refreshToken) throw new Error('No refresh token available.');
    this.log.debug('[Auth] Refreshing access token...');
    try {
      const response = await axios.post<TokenResponse>(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: CLIENT_ID,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      await this.storeTokenResponse(response.data);
      this.log.debug('[Auth] Token refreshed successfully.');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : String(err);
      this.log.error(`[Auth] Token refresh failed: ${msg}`);
      throw err;
    }
  }

  // ─── Get a valid access token (auto-refresh if needed) ──────────────────

  async getValidToken(): Promise<string> {
    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
    if (!this.accessToken) throw new Error('Not authenticated. Please provide authorization code.');
    if (Date.now() > this.tokenExpiry - REFRESH_BUFFER_MS) {
      await this.refreshTokens();
    }
    return this.accessToken;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private async storeTokenResponse(data: TokenResponse): Promise<void> {
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
    await this.onTokensUpdated({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry,
    });
  }

  // ─── Utility: generate fresh PKCE pair (for future use) ─────────────────

  static generatePkce(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }
}
