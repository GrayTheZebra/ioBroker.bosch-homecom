// ─── OAuth / Auth ────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number; // unix timestamp ms
}

// ─── Bosch API ───────────────────────────────────────────────────────────────

export interface Gateway {
  deviceId?: string;
  gatewayId: string;
  deviceType: string;       // "RAC" | "K30" | "K40" | "ICOM" | "RRC2" | "WDDW2" | "Commodule"
  firmwareVersion?: string;
  gatewayType?: string;
  serialNumber?: string;
  status?: string;
  resources?: ResourceNode[];
}

export interface ResourceNode {
  id: string;
  uri: string;
  readable: boolean;
  writeable: boolean;
  type: string;             // "stringValue" | "floatValue" | "booleanValue" | "enumValue" | ...
  value?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  allowedValues?: string[];
  references?: ResourceRef[];
  recordedAt?: string;
}

export interface ResourceRef {
  id: string;
  uri: string;
}

export interface GatewayResource {
  id: string;
  references?: ResourceRef[];
  [key: string]: unknown;
}

// ─── Adapter config (native) ─────────────────────────────────────────────────

export interface AdapterConfig {
  authCode: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  pollInterval: number;
}

// ─── Internal ────────────────────────────────────────────────────────────────

export interface StateDefinition {
  id: string;
  name: string;
  type: ioBroker.CommonType;
  role: string;
  unit?: string;
  read: boolean;
  write: boolean;
  min?: number;
  max?: number;
  states?: Record<string, string>;
  apiPath: string;
}
