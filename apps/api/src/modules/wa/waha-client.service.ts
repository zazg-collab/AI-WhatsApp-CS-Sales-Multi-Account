import { Injectable, BadGatewayException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WahaClientService {
  private readonly logger = new Logger(WahaClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('WAHA_API_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('WAHA_API_KEY');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-Api-Key'] = this.apiKey;
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`WAHA ${method} ${path} → ${res.status}: ${text}`);
      throw new BadGatewayException(`WAHA error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async createSession(sessionId: string): Promise<void> {
    await this.request('POST', '/api/sessions', { name: sessionId });
  }

  async startSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/start`, {});
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/stop`, {});
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/api/sessions/${sessionId}`, undefined);
  }

  async getSession(sessionId: string): Promise<{ name: string; status: string; me?: { id: string; pushName: string } }> {
    return this.request('GET', `/api/sessions/${sessionId}`);
  }

  async listSessions(): Promise<Array<{ name: string; status: string }>> {
    return this.request('GET', '/api/sessions');
  }

  async getQr(sessionId: string): Promise<string> {
    const res = await this.request<{ value: string }>('GET', `/api/${sessionId}/auth/qr`);
    return res.value;
  }

  async sendText(sessionId: string, chatId: string, text: string): Promise<string> {
    const res = await this.request<{ id: string }>('POST', '/api/sendText', {
      session: sessionId,
      chatId,
      text,
    });
    return res.id;
  }

  async sendImage(sessionId: string, chatId: string, url: string, caption?: string): Promise<string> {
    const res = await this.request<{ id: string }>('POST', '/api/sendImage', {
      session: sessionId,
      chatId,
      file: { url },
      caption,
    });
    return res.id;
  }

  async sendFile(sessionId: string, chatId: string, url: string, filename: string): Promise<string> {
    const res = await this.request<{ id: string }>('POST', '/api/sendFile', {
      session: sessionId,
      chatId,
      file: { url },
      filename,
    });
    return res.id;
  }

  async sendSeen(sessionId: string, chatId: string, messageId: string): Promise<void> {
    await this.request('POST', '/api/sendSeen', { session: sessionId, chatId, messageId });
  }

  async startTyping(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', '/api/startTyping', { session: sessionId, chatId });
  }

  async stopTyping(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', '/api/stopTyping', { session: sessionId, chatId });
  }
}
