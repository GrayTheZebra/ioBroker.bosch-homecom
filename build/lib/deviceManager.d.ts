import type { AdapterInstance } from '@iobroker/adapter-core';
import type { Gateway } from './types';
import type { ApiClient } from './api';
export type LogFn = (msg: string) => void;
export declare class DeviceManager {
    private readonly adapter;
    private readonly api;
    private readonly log;
    constructor(adapter: AdapterInstance, api: ApiClient, log: {
        debug: LogFn;
        info: LogFn;
        warn: LogFn;
        error: LogFn;
    });
    syncGateways(gateways: Gateway[]): Promise<void>;
    private syncResources;
    updateGatewayStates(gateways: Gateway[]): Promise<void>;
    writeState(id: string, value: ioBroker.StateValue): Promise<void>;
    private setState;
    private setStateWithMeta;
    private buildStateId;
    private sanitizeId;
    private uriToName;
    private detectRole;
}
