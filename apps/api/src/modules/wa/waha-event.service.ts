import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { WaMessageShape, WahaSessionStatus } from './wa.types';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { ContactSyncService } from './contact-sync.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { SessionStatus } from '@hermes/database';
import { jidToPhone } from './wa.util';

/** Maps WAHA session statuses to our SessionStatus enum */
function toSessionStatus(wahaStatus: WahaSessionStatus): SessionStatus {
  switch (wahaStatus) {
    case 'WORKING':      return SessionStatus.connected;
    case 'SCAN_QR_CODE': return SessionStatus.qr_required;
    case 'STARTING':     return SessionStatus.reconnecting;
    case 'FAILED':
    case 'STOPPED':
    default:             return SessionStatus.disconnected;
  }
}

@Injectable()
export class WahaEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WahaEventService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private reconnectAttempt = 0;

  private readonly wsUrl: string;

  constructor(
    config: ConfigService,
    private readonly inbound: WaInboundService,
    private readonly mirror: WaMirrorService,
    private readonly contactSync: ContactSyncService,
    private readonly events: EventsGateway,
    // Forward ref because WaService and WahaEventService are in the same module
    @Inject(forwardRef(() => WaServiceRef)) private readonly waServiceRef: WaServiceRef,
  ) {
    const apiUrl = (config.get<string>('WAHA_API_URL') ?? 'http://waha:3000').replace(/\/$/, '');
    const apiKey = config.get<string>('WAHA_API_KEY') ?? '';
    const wsBase = apiUrl.replace(/^http/, 'ws');
    this.wsUrl = `${wsBase}/ws?x-api-key=${encodeURIComponent(apiKey)}`;
  }

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.destroyed) return;
    this.logger.log(`Connecting to WAHA WebSocket… (attempt ${this.reconnectAttempt + 1})`);

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.on('open', () => {
      this.logger.log('WAHA WebSocket connected');
      this.reconnectAttempt = 0;
    });

    ws.on('message', (data: Buffer) => {
      try {
        const envelope = JSON.parse(data.toString()) as {
          event: string;
          session: string;
          payload: unknown;
        };
        this.routeEvent(envelope.session, envelope.event, envelope.payload).catch((err) =>
          this.logger.error(`Event routing error [${envelope.event}]: ${err}`),
        );
      } catch (err) {
        this.logger.warn(`Failed to parse WAHA event: ${err}`);
      }
    });

    ws.on('close', () => {
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.logger.error(`WAHA WebSocket error: ${err.message}`);
    });
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt++;
    this.logger.log(`WAHA WebSocket reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ── Event routing ────────────────────────────────────────────────────────

  private async routeEvent(session: string, event: string, payload: unknown): Promise<void> {
    switch (event) {
      case 'message':
      case 'message.any':
        await this.onMessage(session, payload as WahaRawMessage);
        break;

      case 'message.reaction':
        await this.onReaction(session, payload as WahaReactionPayload);
        break;

      case 'message.revoked':
        await this.onRevoked(session, payload as { id: string });
        break;

      case 'message.ack':
        await this.onAck(session, payload as WahaAckPayload);
        break;

      case 'contact.upserted':
        await this.onContact(session, payload as WahaContactPayload | WahaContactPayload[]);
        break;

      case 'group.join':
      case 'group.leave':
      case 'group.update':
        await this.onGroup(session, payload as WahaGroupPayload);
        break;

      case 'group.participants.update':
        await this.onGroupParticipants(session, payload as WahaGroupParticipantsPayload);
        break;

      case 'presence.update':
        await this.onPresence(session, payload as WahaPresencePayload);
        break;

      case 'call.received':
        await this.onCall(session, payload as WahaCallPayload);
        break;

      case 'session.status':
        await this.onSessionStatus(session, payload as { status: WahaSessionStatus; qr?: string });
        break;

      default:
        // Silently ignore unknown events
        break;
    }
  }

  // ── Normalisers ──────────────────────────────────────────────────────────

  private async onMessage(session: string, payload: WahaRawMessage): Promise<void> {
    const m: WaMessageShape = {
      key: {
        remoteJid: payload.from,
        fromMe: payload.fromMe,
        id: payload.id,
        senderPn: payload.participant ?? undefined,
      },
      pushName: payload.notifyName ?? undefined,
      messageTimestamp: payload.timestamp,
      wahaType: payload.type ?? 'text',
      body: payload.body ?? '',
      mediaUrl: payload.media?.url ?? undefined,
      mediaMimetype: payload.media?.mimetype ?? undefined,
      mediaFilename: payload.media?.filename ?? undefined,
      location: payload.location
        ? { latitude: payload.location.latitude, longitude: payload.location.longitude, name: payload.location.description }
        : undefined,
      quotedId: payload.replyTo?.id ?? undefined,
    };
    await this.inbound.handleIncoming(session, m);
  }

  private async onReaction(session: string, payload: WahaReactionPayload): Promise<void> {
    await this.mirror.applyReaction(
      session,
      payload.messageId,
      payload.reaction ?? '',
      jidToPhone(payload.from),
    );
  }

  private async onRevoked(session: string, payload: { id: string }): Promise<void> {
    await this.mirror.applyRevoke(session, payload.id);
  }

  private async onAck(session: string, payload: WahaAckPayload): Promise<void> {
    // WAHA ack levels: 1=delivered, 2=read, 3=played. Map to receipt timestamps.
    const now = Math.floor(Date.now() / 1000);
    const receipt: {
      userJid?: string;
      deliveredDeviceJid?: string[];
      readTimestamp?: number;
      playedTimestamp?: number;
    } = { userJid: payload.from };
    if (payload.ack >= 3) {
      receipt.playedTimestamp = now;
    } else if (payload.ack >= 2) {
      receipt.readTimestamp = now;
    } else if (payload.ack >= 1) {
      receipt.deliveredDeviceJid = [payload.from];
    }
    await this.mirror.applyReceiptDetail(session, payload.id, receipt);
  }

  private async onContact(
    session: string,
    payload: WahaContactPayload | WahaContactPayload[],
  ): Promise<void> {
    const contacts = Array.isArray(payload) ? payload : [payload];
    await this.contactSync.syncContacts(
      session,
      contacts.map((c) => ({
        id: c.id,
        name: c.name ?? c.notify ?? undefined,
        notify: c.notify ?? undefined,
      })),
    );
  }

  private async onGroup(session: string, payload: WahaGroupPayload): Promise<void> {
    await this.mirror.applyGroupMetadata(session, {
      id: payload.id,
      subject: payload.subject,
      owner: payload.owner,
      desc: payload.description,
      participants: payload.participants,
    });
  }

  private async onGroupParticipants(session: string, payload: WahaGroupParticipantsPayload): Promise<void> {
    await this.mirror.applyGroupParticipantUpdate(session, {
      id: payload.id,
      author: payload.author,
      participants: payload.participants,
      action: payload.action,
    });
  }

  private async onPresence(session: string, payload: WahaPresencePayload): Promise<void> {
    const state = payload.presence;
    const typing = state === 'composing' || state === 'recording';
    this.events.emitToAccount(session, 'wa:presence', {
      accountId: session,
      phone: jidToPhone(payload.id),
      typing,
      presence: state ?? 'unavailable',
    });
  }

  private async onCall(session: string, payload: WahaCallPayload): Promise<void> {
    await this.mirror.logCall(session, payload.from, payload.isVideo ?? false);
  }

  private async onSessionStatus(
    session: string,
    payload: { status: WahaSessionStatus; qr?: string },
  ): Promise<void> {
    const status = toSessionStatus(payload.status);
    await this.waServiceRef.setStatus(session, status);

    if (payload.status === 'SCAN_QR_CODE' && payload.qr) {
      this.events.emitToAccount(session, 'wa:qr', { accountId: session, qr: payload.qr });
    }

    if (status === SessionStatus.disconnected || status === SessionStatus.connected) {
      this.events.emitToAccount(session, 'wa:status', { accountId: session, status });
    }
  }
}

// ── Raw WAHA payload types ────────────────────────────────────────────────

interface WahaRawMessage {
  id: string;
  from: string;
  fromMe: boolean;
  participant?: string | null;
  timestamp: number;
  notifyName?: string | null;
  body?: string | null;
  type?: string;
  hasMedia?: boolean;
  media?: { url: string; mimetype?: string; filename?: string } | null;
  location?: { latitude: number; longitude: number; description?: string } | null;
  replyTo?: { id: string } | null;
}

interface WahaReactionPayload {
  messageId: string;
  from: string;
  reaction?: string | null;
}

interface WahaAckPayload {
  id: string;
  from: string;
  ack: number;
}

interface WahaContactPayload {
  id: string;
  name?: string | null;
  notify?: string | null;
}

interface WahaGroupPayload {
  id: string;
  subject?: string;
  owner?: string;
  description?: string;
  participants?: Array<{ id: string; admin?: string | null }>;
}

interface WahaGroupParticipantsPayload {
  id: string;
  author?: string;
  participants: string[];
  action: string;
}

interface WahaPresencePayload {
  id: string;
  presence?: string;
}

interface WahaCallPayload {
  id: string;
  from: string;
  isVideo?: boolean;
}

/** Lightweight forward-ref interface so WahaEventService can call setStatus without circular dep */
interface WaServiceRef {
  setStatus(accountId: string, status: SessionStatus): Promise<void>;
}
const WaServiceRef = Symbol('WaServiceRef');
export { WaServiceRef };
