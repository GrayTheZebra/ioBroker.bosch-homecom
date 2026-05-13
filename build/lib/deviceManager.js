"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
class DeviceManager {
    constructor(adapter, api, log) {
        this.adapter = adapter;
        this.api = api;
        this.log = log;
    }
    async syncGateways(gateways) {
        var _a, _b, _c, _d, _e;
        this.log.info(`[DeviceManager] Syncing ${gateways.length} gateway(s)...`);
        for (const gw of gateways) {
            const deviceId = this.sanitizeId(gw.gatewayId);
            await this.adapter.setObjectNotExistsAsync(deviceId, {
                type: 'device',
                common: { name: `${(_a = gw.deviceType) !== null && _a !== void 0 ? _a : 'Unknown'} (${gw.gatewayId})` },
                native: { gatewayId: gw.gatewayId, deviceType: gw.deviceType },
            });
            await this.adapter.setObjectNotExistsAsync(`${deviceId}.info`, {
                type: 'channel', common: { name: 'Device Info' }, native: {},
            });
            await this.setState(`${deviceId}.info.gatewayId`, 'Gateway ID', 'string', 'text', (_b = gw.gatewayId) !== null && _b !== void 0 ? _b : '', false);
            await this.setState(`${deviceId}.info.deviceType`, 'Device Type', 'string', 'text', (_c = gw.deviceType) !== null && _c !== void 0 ? _c : '', false);
            await this.setState(`${deviceId}.info.firmwareVersion`, 'Firmware', 'string', 'text', (_d = gw.firmwareVersion) !== null && _d !== void 0 ? _d : '', false);
            await this.setState(`${deviceId}.info.status`, 'Status', 'string', 'indicator', (_e = gw.status) !== null && _e !== void 0 ? _e : '', false);
            await this.syncResources(gw.gatewayId, deviceId);
        }
        this.log.info('[DeviceManager] Sync complete.');
    }
    async syncResources(gatewayId, deviceId) {
        this.log.info(`[DeviceManager] Discovering resources for ${gatewayId}...`);
        let resources = [];
        try {
            resources = await this.api.discoverResources(gatewayId);
        }
        catch (err) {
            this.log.error(`[DeviceManager] Resource discovery failed for ${gatewayId}: ${err}`);
            return;
        }
        this.log.info(`[DeviceManager] Found ${resources.length} resource(s) for ${gatewayId}.`);
        for (const resource of resources) {
            if (!resource.uri)
                continue;
            const stateId = this.buildStateId(deviceId, resource.uri);
            const name = this.uriToName(resource.uri);
            const type = resource.type || 'string';
            const role = this.detectRole(resource);
            await this.setStateWithMeta(stateId, name, type, role, resource);
        }
    }
    async updateGatewayStates(gateways) {
        for (const gw of gateways) {
            const deviceId = this.sanitizeId(gw.gatewayId);
            let resources = [];
            try {
                resources = await this.api.discoverResources(gw.gatewayId);
            }
            catch {
                continue;
            }
            for (const resource of resources) {
                if (!resource.uri)
                    continue;
                const stateId = this.buildStateId(deviceId, resource.uri);
                try {
                    await this.adapter.setStateAsync(stateId, { val: resource.value, ack: true });
                }
                catch { /* state may not exist yet */ }
            }
        }
    }
    async writeState(id, value) {
        const parts = id.split('.');
        const gatewayId = parts[2];
        const resIdx = parts.indexOf('resources');
        if (resIdx === -1 || !gatewayId) {
            this.log.warn(`[DeviceManager] Cannot determine resource path from state ID: ${id}`);
            return;
        }
        const resourcePath = parts.slice(resIdx + 1).join('/');
        await this.api.putResource(gatewayId, resourcePath, value);
    }
    async setState(id, name, type, role, value, write) {
        await this.adapter.setObjectNotExistsAsync(id, {
            type: 'state', common: { name, type, role, read: true, write }, native: {},
        });
        await this.adapter.setStateAsync(id, { val: value, ack: true });
    }
    async setStateWithMeta(id, name, type, role, resource) {
        const common = { name, type, role, read: resource.readable, write: resource.writeable };
        if (resource.unit)
            common.unit = resource.unit;
        if (resource.min !== undefined)
            common.min = resource.min;
        if (resource.max !== undefined)
            common.max = resource.max;
        await this.adapter.setObjectNotExistsAsync(id, { type: 'state', common, native: {} });
        if (resource.value !== undefined && resource.value !== null) {
            await this.adapter.setStateAsync(id, { val: resource.value, ack: true });
        }
    }
    buildStateId(deviceId, uri) {
        const clean = (uri || '').replace(/^\//, '').replace(/\//g, '.').replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${deviceId}.resources.${clean}`;
    }
    sanitizeId(id) {
        return (id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    uriToName(uri) {
        const parts = (uri || '').replace(/^\//, '').split('/');
        return (parts[parts.length - 1] || uri).replace(/_/g, ' ');
    }
    detectRole(resource) {
        const uri = (resource.uri || '').toLowerCase();
        if (uri.includes('temperature') || uri.includes('temp'))
            return 'value.temperature';
        if (uri.includes('humidity'))
            return 'value.humidity';
        if (uri.includes('power') && resource.type === 'boolean')
            return 'switch.power';
        if (uri.includes('mode'))
            return 'text';
        if (resource.type === 'boolean')
            return 'indicator';
        if (resource.type === 'number')
            return 'value';
        return 'text';
    }
}
exports.DeviceManager = DeviceManager;
//# sourceMappingURL=deviceManager.js.map