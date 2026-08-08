/**
 * Test Harness Types
 * 
 * Type definitions untuk Sentinel Web Chat Simulator (v2).
 * Port-safe design — no port changes, isolated database, same NestJS app.
 * 
 * Created: 2026-08-08
 */

export interface TestSession {
  id: string;
  name: string;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  debugInfo?: DebugSnapshot;
}

export interface DebugSnapshot {
  status: string;
  funnelMode: 'normal' | 'total' | 'patokan' | 'closing';
  kotaTujuan?: string;
  ongkir?: {
    amount: number;
    courier: string;
    service: string;
  };
  items: Array<{
    name: string;
    qty: number;
    price: number;
  }>;
  tokens: Record<string, string>;
  gateWarnings: string[];
  orderContextLog?: any[];
  toolCalls?: Array<{
    name: string;
    args: any;
    result: any;
  }>;
}

export interface TestScenario {
  name: string;
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface CreateSessionRequest {
  name: string;
  provider?: string;
  model?: string;
}

export interface SendMessageRequest {
  text: string;
}

export interface SendMessageResponse {
  message: TestMessage;
  reply: TestMessage;
}

export interface LoadScenarioRequest {
  scenarioName: string;
}

export interface SwitchProviderRequest {
  provider: string;
  model: string;
}

export interface ProviderInfo {
  name: string;
  models: string[];
}
