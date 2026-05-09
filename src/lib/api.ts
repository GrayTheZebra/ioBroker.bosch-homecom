import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { AuthManager } from './auth';
import type { Gateway, ResourceNode, GatewayResource } from './types';

const BASE_URL = 'https://pointt-api.bosch-thermotechnology.com/pointt-api/api/v1';

export type LogFn = (msg: string) => void;

export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly auth: AuthManager,
    private readonly log: { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn },
  ) {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 15_000 });
  }

  // ─── Gateway list ────────────────────────────────────────────────────────

  async getGateways(): Promise<Gateway[]> {
    const data = await this.request<Gateway[] | { gateways?: Gateway[] }>('GET', '/gateways/');
    let gateways: Gateway[] = [];
    if (Array.isArray(data)) gateways = data;
    else if (data && typeof data === 'object' && 'gateways' in data) gateways = data.gateways ?? [];

    // API returns deviceId — normalize to gatewayId
    return gateways.map((gw: Gateway & { deviceId?: string }) => ({
      ...gw,
      gatewayId: gw.gatewayId || gw.deviceId || '',
    }));
  }

  // ─── Read a single resource path ────────────────────────────────────────

  async getResource(gatewayId: string, path: string): Promise<GatewayResource> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return this.request<GatewayResource>('GET', `/gateways/${gatewayId}/resource${clean}`);
  }

  // ─── Write a value to a resource path ───────────────────────────────────

  async putResource(gatewayId: string, path: string, value: unknown): Promise<void> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    await this.request('PUT', `/gateways/${gatewayId}/resource${clean}`, { value });
  }

  // ─── Recursive resource discovery using id fields (not uri) ─────────────

  async discoverResources(gatewayId: string): Promise<ResourceNode[]> {
    const results: ResourceNode[] = [];
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
        const node = await this.request<GatewayResource>('GET', `/gateways/${gatewayId}${root}`);
        await this.traverseNode(gatewayId, root.replace('/resource', ''), node, results, 0);
      } catch {
        // endpoint not available for this device type — skip silently
      }
    }
    return results;
  }

  private async traverseNode(
    gatewayId: string,
    currentPath: string,
    node: GatewayResource,
    results: ResourceNode[],
    depth: number,
  ): Promise<void> {
    if (depth > 6) return;

    const type = this.detectType(node);

    // Leaf node — has a value
    if (type !== 'ref' && depth > 0) {
      results.push({
        id: (node.id as string) || currentPath,
        uri: currentPath,
        readable: true,
        writeable: node.writeable === 1 || node.writeable === true,
        type,
        value: this.extractValue(node),
        unit: (node.unitOfMeasure as string) || (node.unit as string) || undefined,
      });
    }

    // Follow references using the id field (not uri which points to local IP)
    if (Array.isArray(node.references)) {
      for (const ref of node.references as Array<{ id: string; uri: string }>) {
        if (!ref.id) continue;
        // id is like "/dhwCircuits/dhw1" — use directly as resource path
        const refPath = ref.id.startsWith('/') ? ref.id : `/${ref.id}`;
        try {
          const child = await this.request<GatewayResource>(
            'GET',
            `/gateways/${gatewayId}/resource${refPath}`,
          );
          await this.traverseNode(gatewayId, refPath, child, results, depth + 1);
        } catch {
          // skip unreachable child
        }
      }
    }
  }

  private detectType(node: GatewayResource): string {
    const t = node.type as string || '';
    if (t === 'refEnum' || t === 'ref') return 'ref';
    if (t === 'floatValue' || t === 'intValue') return 'number';
    if (t === 'booleanValue') return 'boolean';
    if (t === 'stringValue' || t === 'enumValue' || t === 'errorList') return 'string';
    if ('floatValue' in node || 'intValue' in node) return 'number';
    if ('booleanValue' in node) return 'boolean';
    return 'string';
  }

  private extractValue(node: GatewayResource): unknown {
    if ('value' in node) return node.value;
    if ('floatValue' in node) return node.floatValue;
    if ('intValue' in node) return node.intValue;
    if ('booleanValue' in node) return node.booleanValue;
    if ('enumValue' in node) return node.enumValue;
    if ('stringValue' in node) return node.stringValue;
    return null;
  }

  // ─── Central request handler with auto-retry on 401 ─────────────────────

  private async request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const token = await this.auth.getValidToken();
    const config: AxiosRequestConfig = {
      method, url: path,
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    };
    try {
      this.log.debug(`[API] ${method} ${path}`);
      const response = await this.http.request<T>(config);
      return response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 401 && retry) {
        this.log.warn('[API] 401 — refreshing token and retrying...');
        await this.auth.refreshTokens();
        return this.request<T>(method, path, body, false);
      }
      if (axios.isAxiosError(err)) {
        throw new Error(`API ${method} ${path} failed [${err.response?.status}]: ${JSON.stringify(err.response?.data)}`);
      }
      throw err;
    }
  }
}
