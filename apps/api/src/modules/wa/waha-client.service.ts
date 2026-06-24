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

  async getSessionStatus(sessionId: string): Promise<{ status: string }> {
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

  // ── Session lifecycle (missing) ───────────────────────────────────────────

  async restartSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/restart`);
  }

  // ── Auth (missing) ────────────────────────────────────────────────────────

  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    const res = await this.request<{ code: string }>(
      'POST',
      `/api/${sessionId}/auth/request-code`,
      { phoneNumber, method: 'sms' },
    );
    return res.code;
  }

  async getMe(sessionId: string): Promise<{ id: string; pushName: string } | null> {
    try {
      return await this.request('GET', `/api/sessions/${sessionId}/me`);
    } catch {
      return null;
    }
  }

  // ── Send ops (missing) ────────────────────────────────────────────────────

  async sendVoice(sessionId: string, chatId: string, url: string): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendVoice', {
      session: sessionId, chatId, file: { url },
    });
    return res.id ?? null;
  }

  async sendVideo(sessionId: string, chatId: string, url: string, caption?: string): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendVideo', {
      session: sessionId, chatId, file: { url }, caption: caption ?? '',
    });
    return res.id ?? null;
  }

  async sendLocation(sessionId: string, chatId: string, latitude: number, longitude: number, title?: string): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendLocation', {
      session: sessionId, chatId, latitude, longitude, title: title ?? '',
    });
    return res.id ?? null;
  }

  async sendPoll(sessionId: string, chatId: string, name: string, options: string[], selectableCount?: number): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendPoll', {
      session: sessionId, chatId,
      poll: { name, options, multipleAnswers: (selectableCount ?? 1) > 1 },
    });
    return res.id ?? null;
  }

  async sendContact(sessionId: string, chatId: string, contacts: Array<{ name: string; phone: string }>): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendContactVcard', {
      session: sessionId, chatId,
      contacts: contacts.map((c) => ({ fullName: c.name, phoneNumber: c.phone })),
    });
    return res.id ?? null;
  }

  // ── Message ops (missing) ─────────────────────────────────────────────────

  async setReaction(sessionId: string, messageId: string, reaction: string): Promise<void> {
    await this.request('PUT', '/api/reaction', { session: sessionId, messageId, reaction });
  }

  async setStar(sessionId: string, chatId: string, messageId: string, star: boolean): Promise<void> {
    await this.request('PUT', '/api/star', { session: sessionId, chatId, messageId, star });
  }

  async deleteMessage(sessionId: string, chatId: string, messageId: string): Promise<void> {
    await this.request('DELETE', `/api/messages/${messageId}`, { session: sessionId, chatId });
  }

  async forwardMessage(sessionId: string, chatId: string, messageId: string): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/forwardMessage', {
      session: sessionId, chatId, messageId,
    });
    return res.id ?? null;
  }

  // ── Chat state (missing) ──────────────────────────────────────────────────

  async setArchived(sessionId: string, chatId: string, archived: boolean): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/archive`, { archived });
  }

  async setPinned(sessionId: string, chatId: string, pinned: boolean): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/pin`, { pinned });
  }

  async setMuted(sessionId: string, chatId: string, muted: boolean): Promise<void> {
    const muteEndTime = muted ? Date.now() + 365 * 24 * 60 * 60 * 1000 : 0;
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/mute`, { muteEndTime });
  }

  async setDisappearing(sessionId: string, chatId: string, enabled: boolean, durationSeconds?: number): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/disappearing`, {
      disappearingMessagesInChat: enabled ? (durationSeconds ?? 604800) : 0,
    });
  }

  // ── Contacts (missing) ────────────────────────────────────────────────────

  async checkNumberStatus(sessionId: string, phone: string): Promise<{ numberExists: boolean; chatId?: string }> {
    return this.request('GET', `/api/checkNumberStatus?session=${sessionId}&phone=${encodeURIComponent(phone)}`);
  }

  async getContacts(sessionId: string, search?: string, limit = 50, offset = 0): Promise<Array<{ id: string; name?: string; pushName?: string; number?: string }>> {
    const q = new URLSearchParams({ session: sessionId, limit: String(limit), offset: String(offset) });
    if (search) q.set('search', search);
    return this.request('GET', `/api/${sessionId}/contacts?${q}`);
  }

  async getContactAvatar(sessionId: string, contactId: string): Promise<string | null> {
    try {
      const res = await this.request<{ url?: string }>(
        'GET', `/api/${sessionId}/contacts/${encodeURIComponent(contactId)}/profile-picture`,
      );
      return res.url ?? null;
    } catch {
      return null;
    }
  }

  async setContactBlocked(sessionId: string, contactId: string, blocked: boolean): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/contacts/${encodeURIComponent(contactId)}/block`, { blocked });
  }

  // ── Groups (missing) ──────────────────────────────────────────────────────

  async getGroupInfo(sessionId: string, groupId: string): Promise<{
    id: string; subject?: string; owner?: string; desc?: string;
    participants?: Array<{ id: string; admin?: string | null }>;
  } | null> {
    try {
      return await this.request('GET', `/api/${sessionId}/groups/${encodeURIComponent(groupId)}`);
    } catch {
      return null;
    }
  }

  // ── Media (missing) ───────────────────────────────────────────────────────

  mediaDownloadUrl(sessionId: string, messageId: string): string {
    return `${this.baseUrl}/api/${sessionId}/messages/${messageId}/download`;
  }
}
