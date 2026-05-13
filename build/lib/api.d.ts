import type { AuthManager } from './auth';
import type { Gateway, ResourceNode, GatewayResource } from './types';
export type LogFn = (msg: string) => void;
export declare class ApiClient {
    private readonly auth;
    private readonly log;
    private readonly http;
    constructor(auth: AuthManager, log: {
        debug: LogFn;
        info: LogFn;
        warn: LogFn;
        error: LogFn;
    });
    getGateways(): Promise<Gateway[]>;
    getResource(gatewayId: string, path: string): Promise<GatewayResource>;
    putResource(gatewayId: string, path: string, value: unknown): Promise<void>;
    discoverResources(gatewayId: string): Promise<ResourceNode[]>;
    private traverseNode;
    private detectType;
    private extractValue;
    private request;
}
