import type { StoredTokens } from './types';
export type LogFn = (msg: string) => void;
export declare class AuthManager {
    private readonly log;
    private readonly onTokensUpdated;
    private accessToken;
    private refreshToken;
    private tokenExpiry;
    constructor(log: {
        debug: LogFn;
        info: LogFn;
        warn: LogFn;
        error: LogFn;
    }, onTokensUpdated: (tokens: StoredTokens) => Promise<void>);
    restoreTokens(tokens: StoredTokens): void;
    hasTokens(): boolean;
    getAuthorizationUrl(): string;
    exchangeCode(code: string, verifier?: string): Promise<void>;
    refreshTokens(): Promise<void>;
    getValidToken(): Promise<string>;
    private storeTokenResponse;
    static generatePkce(): {
        verifier: string;
        challenge: string;
    };
}
