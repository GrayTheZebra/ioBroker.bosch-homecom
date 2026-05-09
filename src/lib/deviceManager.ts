import type { AdapterInstance } from '@iobroker/adapter-core';
import type { Gateway, ResourceNode } from './types';
import type { ApiClient } from './api';

export type LogFn = (msg: string) => void;

export class DeviceManager {
  constructor(
    private readonly adapter: AdapterInstance,
    private readonly api: ApiClient,
    private readonly log: { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn },
  ) {}

  async syncGateways(gateways: Gateway[]): Promise<void> {
    this.log.info(`[DeviceManager] Syncing ${gateways.length} gateway(s)...`);
    for (const gw of gateways) {
      const deviceId = this.sanitizeId(gw.gatewayId);
      await this.adapter.setObjectNotExistsAsync(deviceId, {
        type: 'device',
        common: { name: `${gw.deviceType ?? 'Unknown'} (${gw.gatewayId})` },
        native: { gatewayId: gw.gatewayId, deviceType: gw.deviceType },
      });
      await this.adapter.setObjectNotExistsAsync(`${deviceId}.info`, {
        type: 'channel', common: { name: 'Device Info' }, native: {},
      });
      await this.setState(`${deviceId}.info.gatewayId`, 'Gateway ID', 'string', 'text', gw.gatewayId ?? '', false);
      await this.setState(`${deviceId}.info.deviceType`, 'Device Type', 'string', 'text', gw.deviceType ?? '', false);
      await this.setState(`${deviceId}.info.firmwareVersion`, 'Firmware', 'string', 'text', gw.firmwareVersion ?? '', false);
      await this.setState(`${deviceId}.info.status`, 'Status', 'string', 'indicator', gw.status ?? '', false);
      await this.syncResources(gw.gatewayId, deviceId);
    }
    this.log.info('[DeviceManager] Sync complete.');
  }

  private async syncResources(gatewayId: string, deviceId: string): Promise<void> {
    this.log.info(`[DeviceManager] Discovering resources for ${gatewayId}...`);
    let resources: ResourceNode[] = [];
    try {
      resources = await this.api.discoverResources(gatewayId);
    } catch (err) {
      this.log.error(`[DeviceManager] Resource discovery failed for ${gatewayId}: ${err}`);
      return;
    }
    this.log.info(`[DeviceManager] Found ${resources.length} resource(s) for ${gatewayId}.`);
    for (const resource of resources) {
      if (!resource.uri) continue;
      const stateId = this.buildStateId(deviceId, resource.uri);
      const name = this.uriToName(resource.uri);
      const type = (resource.type as ioBroker.CommonType) || 'string';
      const role = this.detectRole(resource);
      await this.setStateWithMeta(stateId, name, type, role, resource);
    }
  }

  async updateGatewayStates(gateways: Gateway[]): Promise<void> {
    for (const gw of gateways) {
      const deviceId = this.sanitizeId(gw.gatewayId);
      let resources: ResourceNode[] = [];
      try {
        resources = await this.api.discoverResources(gw.gatewayId);
      } catch { continue; }
      for (const resource of resources) {
        if (!resource.uri) continue;
        const stateId = this.buildStateId(deviceId, resource.uri);
        try {
          await this.adapter.setStateAsync(stateId, { val: resource.value as ioBroker.StateValue, ack: true });
        } catch { /* state may not exist yet */ }
      }
    }
  }

  async writeState(id: string, value: ioBroker.StateValue): Promise<void> {
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

  private async setState(id: string, name: string, type: ioBroker.CommonType, role: string, value: ioBroker.StateValue, write: boolean): Promise<void> {
    await this.adapter.setObjectNotExistsAsync(id, {
      type: 'state', common: { name, type, role, read: true, write }, native: {},
    });
    await this.adapter.setStateAsync(id, { val: value, ack: true });
  }

  private async setStateWithMeta(id: string, name: string, type: ioBroker.CommonType, role: string, resource: ResourceNode): Promise<void> {
    const common: ioBroker.StateCommon = { name, type, role, read: resource.readable, write: resource.writeable };
    if (resource.unit) common.unit = resource.unit;
    if (resource.min !== undefined) common.min = resource.min;
    if (resource.max !== undefined) common.max = resource.max;
    await this.adapter.setObjectNotExistsAsync(id, { type: 'state', common, native: {} });
    if (resource.value !== undefined && resource.value !== null) {
      await this.adapter.setStateAsync(id, { val: resource.value as ioBroker.StateValue, ack: true });
    }
  }

  private buildStateId(deviceId: string, uri: string): string {
    const clean = (uri || '').replace(/^\//, '').replace(/\//g, '.').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${deviceId}.resources.${clean}`;
  }

  private sanitizeId(id: string): string {
    return (id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private uriToName(uri: string): string {
    const parts = (uri || '').replace(/^\//, '').split('/');
    return (parts[parts.length - 1] || uri).replace(/_/g, ' ');
  }

  private detectRole(resource: ResourceNode): string {
    const uri = (resource.uri || '').toLowerCase();
    if (uri.includes('temperature') || uri.includes('temp')) return 'value.temperature';
    if (uri.includes('humidity')) return 'value.humidity';
    if (uri.includes('power') && resource.type === 'boolean') return 'switch.power';
    if (uri.includes('mode')) return 'text';
    if (resource.type === 'boolean') return 'indicator';
    if (resource.type === 'number') return 'value';
    return 'text';
  }
}
