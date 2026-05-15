"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("@iobroker/adapter-core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const auth_1 = require("./lib/auth");
const api_1 = require("./lib/api");
const deviceManager_1 = require("./lib/deviceManager");
const TOKEN_FILE = path.join(__dirname, '..', 'tokens.json');
class BoschHomecom extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'bosch-homecom' });
        this.pollTimer = null;
        this.refreshTimer = null;
        this.pkceVerifier = null;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    // ─── Token file helpers ──────────────────────────────────────────────────
    loadTokens() {
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
                if (data.accessToken && data.refreshToken)
                    return data;
            }
        }
        catch (err) {
            this.log.warn(`[Auth] Could not read tokens.json: ${err}`);
        }
        return null;
    }
    saveTokens(tokens) {
        try {
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
            this.log.debug('[Auth] Tokens saved to tokens.json');
        }
        catch (err) {
            this.log.error(`[Auth] Could not save tokens.json: ${err}`);
        }
    }
    // ─── Lifecycle ───────────────────────────────────────────────────────────
    async onReady() {
        this.log.info('Bosch HomeCom adapter starting...');
        this.subscribeStates('*');
        this.auth = new auth_1.AuthManager(this.log, async (tokens) => {
            this.saveTokens(tokens);
        });
        this.api = new api_1.ApiClient(this.auth, this.log);
        this.deviceManager = new deviceManager_1.DeviceManager(this, this.api, this.log);
        // Try to load tokens from file
        const tokens = this.loadTokens();
        if (tokens) {
            this.auth.restoreTokens(tokens);
            this.log.info('[Auth] Tokens loaded from tokens.json');
        }
        else {
            this.log.warn('[Auth] No tokens found. Please open the adapter config and complete the login.');
            await this.setStateAsync('info.connection', { val: false, ack: true });
            return;
        }
        await this.connect();
    }
    async connect() {
        var _a, _b;
        try {
            const config = this.config;
            const pollMs = (((_a = config.pollInterval) !== null && _a !== void 0 ? _a : 300)) * 1000;
            this.log.info('[API] Connecting to Bosch cloud...');
            const gateways = await this.api.getGateways();
            if (gateways.length === 0) {
                this.log.warn('[API] No gateways found.');
            }
            else {
                this.log.info(`[API] Found ${gateways.length} gateway(s). Creating objects...`);
                await this.deviceManager.syncGateways(gateways);
            }
            await this.setStateAsync('info.connection', { val: true, ack: true });
            this.log.info(`[Adapter] Connected. Polling every ${(_b = config.pollInterval) !== null && _b !== void 0 ? _b : 300}s.`);
            this.pollTimer = setInterval(() => this.poll(), pollMs);
            // Proactive token refresh every 12h
            this.refreshTimer = setInterval(async () => {
                try {
                    await this.auth.refreshTokens();
                }
                catch (err) {
                    this.log.error(`[Auth] Proactive refresh failed: ${err}`);
                    await this.setStateAsync('info.connection', { val: false, ack: true });
                }
            }, 12 * 60 * 60 * 1000);
        }
        catch (err) {
            this.log.error(`[Adapter] Connection failed: ${err}`);
            await this.setStateAsync('info.connection', { val: false, ack: true });
        }
    }
    async poll() {
        try {
            const gateways = await this.api.getGateways();
            await this.deviceManager.updateGatewayStates(gateways);
            await this.setStateAsync('info.connection', { val: true, ack: true });
        }
        catch (err) {
            this.log.error(`[Adapter] Poll failed: ${err}`);
            await this.setStateAsync('info.connection', { val: false, ack: true });
        }
    }
    // ─── State changes ───────────────────────────────────────────────────────
    async onStateChange(id, state) {
        if (!state || state.ack)
            return;
        try {
            await this.deviceManager.writeState(id, state.val);
            await this.setStateAsync(id, { val: state.val, ack: true });
        }
        catch (err) {
            this.log.error(`[Adapter] Write state ${id} failed: ${err}`);
        }
    }
    // ─── Messages from admin UI ──────────────────────────────────────────────
    async onMessage(obj) {
        var _a, _b;
        if (!(obj === null || obj === void 0 ? void 0 : obj.command))
            return;
        switch (obj.command) {
            case 'storeVerifier': {
                const v = (_a = obj.message) === null || _a === void 0 ? void 0 : _a.verifier;
                if (v)
                    this.pkceVerifier = v;
                this.sendTo(obj.from, obj.command, { ok: true }, obj.callback);
                break;
            }
            case 'exchangeCode': {
                const msg = obj.message;
                const code = (_b = msg === null || msg === void 0 ? void 0 : msg.code) === null || _b === void 0 ? void 0 : _b.trim();
                const verifier = (msg === null || msg === void 0 ? void 0 : msg.verifier) || this.pkceVerifier || '';
                if (!code) {
                    this.sendTo(obj.from, obj.command, { error: 'No code provided' }, obj.callback);
                    return;
                }
                if (!verifier) {
                    this.sendTo(obj.from, obj.command, { error: 'No PKCE verifier. Please click "Open login URL" first.' }, obj.callback);
                    return;
                }
                try {
                    await this.auth.exchangeCode(code, verifier);
                    this.pkceVerifier = null;
                    this.log.info('[Auth] Login successful via admin UI.');
                    this.sendTo(obj.from, obj.command, { success: true }, obj.callback);
                    if (this.pollTimer) {
                        clearInterval(this.pollTimer);
                        this.pollTimer = null;
                    }
                    if (this.refreshTimer) {
                        clearInterval(this.refreshTimer);
                        this.refreshTimer = null;
                    }
                    await this.connect();
                }
                catch (err) {
                    this.sendTo(obj.from, obj.command, { error: String(err) }, obj.callback);
                }
                break;
            }
            case 'testConnection': {
                try {
                    const gateways = await this.api.getGateways();
                    this.sendTo(obj.from, obj.command, { success: true, gatewayCount: gateways.length }, obj.callback);
                }
                catch (err) {
                    this.sendTo(obj.from, obj.command, { success: false, error: String(err) }, obj.callback);
                }
                break;
            }
            default:
                this.log.warn(`[Adapter] Unknown message: ${obj.command}`);
        }
    }
    // ─── Cleanup ─────────────────────────────────────────────────────────────
    onUnload(callback) {
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        if (this.refreshTimer)
            clearInterval(this.refreshTimer);
        callback();
    }
}
if (require.main !== module) {
    module.exports = (options) => new BoschHomecom(options);
}
else {
    (() => new BoschHomecom())();
}
//# sourceMappingURL=main.js.map