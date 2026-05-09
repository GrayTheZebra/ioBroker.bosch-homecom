import * as utils from '@iobroker/adapter-core';
import * as fs from 'fs';
import * as path from 'path';
import { AuthManager } from './lib/auth';
import { ApiClient } from './lib/api';
import { DeviceManager } from './lib/deviceManager';
import type { StoredTokens } from './lib/types';

const TOKEN_FILE = path.join(__dirname, '..', 'tokens.json');

class BoschHomecom extends utils.Adapter {
  private auth!: AuthManager;
  private api!: ApiClient;
  private deviceManager!: DeviceManager;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private pkceVerifier: string | null = null;

  constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({ ...options, name: 'bosch-homecom' });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('message', this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  // ─── Token file helpers ──────────────────────────────────────────────────

  private loadTokens(): StoredTokens | null {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        if (data.accessToken && data.refreshToken) return data;
      }
    } catch (err) {
      this.log.warn(`[Auth] Could not read tokens.json: ${err}`);
    }
    return null;
  }

  private saveTokens(tokens: StoredTokens): void {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
      this.log.debug('[Auth] Tokens saved to tokens.json');
    } catch (err) {
      this.log.error(`[Auth] Could not save tokens.json: ${err}`);
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  private async onReady(): Promise<void> {
    this.log.info('Bosch HomeCom adapter starting...');
    this.subscribeStates('*');

    this.auth = new AuthManager(this.log, async (tokens) => {
      this.saveTokens(tokens);
    });

    this.api = new ApiClient(this.auth, this.log);
    this.deviceManager = new DeviceManager(this, this.api, this.log);

    // Try to load tokens from file
    const tokens = this.loadTokens();
    if (tokens) {
      this.auth.restoreTokens(tokens);
      this.log.info('[Auth] Tokens loaded from tokens.json');
    } else {
      this.log.warn('[Auth] No tokens found. Please open the adapter config and complete the login.');
      await this.setStateAsync('info.connection', { val: false, ack: true });
      return;
    }

    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const config = this.config as unknown as { pollInterval?: number };
      const pollMs = ((config.pollInterval ?? 300)) * 1000;

      this.log.info('[API] Connecting to Bosch cloud...');
      const gateways = await this.api.getGateways();

      if (gateways.length === 0) {
        this.log.warn('[API] No gateways found.');
      } else {
        this.log.info(`[API] Found ${gateways.length} gateway(s). Creating objects...`);
        await this.deviceManager.syncGateways(gateways);
      }

      await this.setStateAsync('info.connection', { val: true, ack: true });
      this.log.info(`[Adapter] Connected. Polling every ${config.pollInterval ?? 300}s.`);

      this.pollTimer = setInterval(() => this.poll(), pollMs);

      // Proactive token refresh every 12h
      this.refreshTimer = setInterval(async () => {
        try {
          await this.auth.refreshTokens();
        } catch (err) {
          this.log.error(`[Auth] Proactive refresh failed: ${err}`);
          await this.setStateAsync('info.connection', { val: false, ack: true });
        }
      }, 12 * 60 * 60 * 1000);

    } catch (err) {
      this.log.error(`[Adapter] Connection failed: ${err}`);
      await this.setStateAsync('info.connection', { val: false, ack: true });
    }
  }

  private async poll(): Promise<void> {
    try {
      const gateways = await this.api.getGateways();
      await this.deviceManager.updateGatewayStates(gateways);
      await this.setStateAsync('info.connection', { val: true, ack: true });
    } catch (err) {
      this.log.error(`[Adapter] Poll failed: ${err}`);
      await this.setStateAsync('info.connection', { val: false, ack: true });
    }
  }

  // ─── State changes ───────────────────────────────────────────────────────

  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (!state || state.ack) return;
    try {
      await this.deviceManager.writeState(id, state.val);
      await this.setStateAsync(id, { val: state.val, ack: true });
    } catch (err) {
      this.log.error(`[Adapter] Write state ${id} failed: ${err}`);
    }
  }

  // ─── Messages from admin UI ──────────────────────────────────────────────

  private async onMessage(obj: ioBroker.Message): Promise<void> {
    if (!obj?.command) return;

    switch (obj.command) {

      case 'storeVerifier': {
        const v = (obj.message as { verifier?: string })?.verifier;
        if (v) this.pkceVerifier = v;
        this.sendTo(obj.from, obj.command, { ok: true }, obj.callback);
        break;
      }

      case 'exchangeCode': {
        const msg = obj.message as { code?: string; verifier?: string };
        const code = msg?.code?.trim();
        const verifier = msg?.verifier || this.pkceVerifier || '';

        if (!code) {
          this.sendTo(obj.from, obj.command, { error: 'No code provided' }, obj.callback);
          return;
        }
        if (!verifier) {
          this.sendTo(obj.from, obj.command, { error: 'No PKCE verifier. Please click "Login-URL öffnen" first.' }, obj.callback);
          return;
        }

        try {
          await this.auth.exchangeCode(code, verifier);
          this.pkceVerifier = null;
          this.log.info('[Auth] Login successful via admin UI.');
          this.sendTo(obj.from, obj.command, { success: true }, obj.callback);
          if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
          if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
          await this.connect();
        } catch (err) {
          this.sendTo(obj.from, obj.command, { error: String(err) }, obj.callback);
        }
        break;
      }

      case 'testConnection': {
        try {
          const gateways = await this.api.getGateways();
          this.sendTo(obj.from, obj.command, { success: true, gatewayCount: gateways.length }, obj.callback);
        } catch (err) {
          this.sendTo(obj.from, obj.command, { success: false, error: String(err) }, obj.callback);
        }
        break;
      }

      default:
        this.log.warn(`[Adapter] Unknown message: ${obj.command}`);
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  private onUnload(callback: () => void): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    callback();
  }
}

if (require.main !== module) {
  module.exports = (options: Partial<utils.AdapterOptions>) => new BoschHomecom(options);
} else {
  (() => new BoschHomecom())();
}

export {};
