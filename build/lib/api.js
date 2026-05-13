"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'https://pointt-api.bosch-thermotechnology.com/pointt-api/api/v1';
class ApiClient {
    constructor(auth, log) {
        this.auth = auth;
        this.log = log;
        this.http = axios_1.default.create({ baseURL: BASE_URL, timeout: 15000 });
    }
    // ─── Gateway list ────────────────────────────────────────────────────────
    async getGateways() {
        var _a;
        const data = await this.request('GET', '/gateways/');
        let gateways = [];
        if (Array.isArray(data))
            gateways = data;
        else if (data && typeof data === 'object' && 'gateways' in data)
            gateways = (_a = data.gateways) !== null && _a !== void 0 ? _a : [];
        // API returns deviceId — normalize to gatewayId
        return gateways.map((gw) => ({
            ...gw,
            gatewayId: gw.gatewayId || gw.deviceId || '',
        }));
    }
    // ─── Read a single resource path ────────────────────────────────────────
    async getResource(gatewayId, path) {
        const clean = path.startsWith('/') ? path : `/${path}`;
        return this.request('GET', `/gateways/${gatewayId}/resource${clean}`);
    }
    // ─── Write a value to a resource path ───────────────────────────────────
    async putResource(gatewayId, path, value) {
        const clean = path.startsWith('/') ? path : `/${path}`;
        await this.request('PUT', `/gateways/${gatewayId}/resource${clean}`, { value });
    }
    // ─── Recursive resource discovery using id fields (not uri) ─────────────
    async discoverResources(gatewayId) {
        const results = [];
        // Known root paths for all device types
        const roots = [
            '/resource/dhwCircuits',
            '/resource/heatingCircuits',
            '/resource/heatSources',
            '/resource/airConditioning',
            '/resource/system',
            '/resource/gateway',
            '/resource/notifications',
            '/resource/zones',
            '/resource/ventilation',
            '/resource/devices',
            '/resource/energy',
            '/resource/pv',
        ];
        for (const root of roots) {
            try {
                const node = await this.request('GET', `/gateways/${gatewayId}${root}`);
                await this.traverseNode(gatewayId, root.replace('/resource', ''), node, results, 0);
            }
            catch {
                // endpoint not available for this device type — skip silently
            }
        }
        return results;
    }
    async traverseNode(gatewayId, currentPath, node, results, depth) {
        if (depth > 6)
            return;
        const type = this.detectType(node);
        // Leaf node — has a value
        if (type !== 'ref' && depth > 0) {
            results.push({
                id: node.id || currentPath,
                uri: currentPath,
                readable: true,
                writeable: node.writeable === 1 || node.writeable === true,
                type,
                value: this.extractValue(node),
                unit: node.unitOfMeasure || node.unit || undefined,
            });
        }
        // Follow references using the id field (not uri which points to local IP)
        if (Array.isArray(node.references)) {
            for (const ref of node.references) {
                if (!ref.id)
                    continue;
                // id is like "/dhwCircuits/dhw1" — use directly as resource path
                const refPath = ref.id.startsWith('/') ? ref.id : `/${ref.id}`;
                try {
                    const child = await this.request('GET', `/gateways/${gatewayId}/resource${refPath}`);
                    await this.traverseNode(gatewayId, refPath, child, results, depth + 1);
                }
                catch {
                    // skip unreachable child
                }
            }
        }
    }
    detectType(node) {
        const t = node.type || '';
        if (t === 'refEnum' || t === 'ref')
            return 'ref';
        if (t === 'floatValue' || t === 'intValue')
            return 'number';
        if (t === 'booleanValue')
            return 'boolean';
        if (t === 'stringValue' || t === 'enumValue' || t === 'errorList')
            return 'string';
        if ('floatValue' in node || 'intValue' in node)
            return 'number';
        if ('booleanValue' in node)
            return 'boolean';
        return 'string';
    }
    extractValue(node) {
        if ('value' in node)
            return node.value;
        if ('floatValue' in node)
            return node.floatValue;
        if ('intValue' in node)
            return node.intValue;
        if ('booleanValue' in node)
            return node.booleanValue;
        if ('enumValue' in node)
            return node.enumValue;
        if ('stringValue' in node)
            return node.stringValue;
        return null;
    }
    // ─── Central request handler with auto-retry on 401 ─────────────────────
    async request(method, path, body, retry = true) {
        var _a, _b, _c;
        const token = await this.auth.getValidToken();
        const config = {
            method, url: path,
            headers: { Authorization: `Bearer ${token}` },
            data: body,
        };
        try {
            this.log.debug(`[API] ${method} ${path}`);
            const response = await this.http.request(config);
            return response.data;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && ((_a = err.response) === null || _a === void 0 ? void 0 : _a.status) === 401 && retry) {
                this.log.warn('[API] 401 — refreshing token and retrying...');
                await this.auth.refreshTokens();
                return this.request(method, path, body, false);
            }
            if (axios_1.default.isAxiosError(err)) {
                throw new Error(`API ${method} ${path} failed [${(_b = err.response) === null || _b === void 0 ? void 0 : _b.status}]: ${JSON.stringify((_c = err.response) === null || _c === void 0 ? void 0 : _c.data)}`);
            }
            throw err;
        }
    }
}
exports.ApiClient = ApiClient;
//# sourceMappingURL=api.js.map