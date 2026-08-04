import type { proto } from '@whiskeysockets/baileys';

/**
 * Engine-agnostic inbound message shape. The rest of the WA module
 * (wa-inbound, message-ingest) only ever sees this — never raw Baileys protos.
 * `mapBaileysMessage` normalises a Baileys proto.IWebMessageInfo into it.
 */
export interface WaMessageShape {
  key: {
    remoteJid: string | null | undefined;
    fromMe: boolean | null | undefined;
    id: string | null | undefined;
    /** Sender phone/jid in group chats (Baileys `key.participant`). */
    senderPn?: string | null;
  };
  /** Display name of sender */
  pushName?: string | null;
  /** Unix timestamp in seconds */
  messageTimestamp?: number | null;
  /** Normalised message type: text | image | video | audio | document | sticker | location | poll_creation */
  // ponytail: field kept named `wahaType` so wa-inbound's wahaTypeToMessageType
  // map didn't need touching during the revert. It's just "message type string".
  wahaType: string;
  /** Extracted text body / caption */
  body: string;
  /** Storage URL — filled in by the connection layer after downloading media. */
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  /** Location payload — non-null when wahaType === 'location' */
  location?: {
    latitude: number;
    longitude: number;
    name?: string | null;
  } | null;
  /** ID of the message this is a reply to */
  quotedId?: string | null;
}

type LongLike = { toNumber?: () => number; low?: number } | number | null | undefined;

function toNumber(v: LongLike): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  if (typeof v.low === 'number') return v.low;
  return undefined;
}

/** >>> ANGGA: waktu kirim (detik Unix) tanpa perlu memetakan seluruh pesan —
 *  dipakai gerbang otomasi di `messages.upsert` sebelum ingest. */
export function baileysTimestamp(m: { messageTimestamp?: unknown }): number | undefined {
  return toNumber(m?.messageTimestamp as LongLike);
}

/** Strip ephemeral/viewOnce/edit wrappers to reach the real content node. */
function unwrap(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  let msg = message;
  // Unwrap a few layers; these wrappers nest the actual message inside.
  for (let i = 0; i < 4 && msg; i++) {
    const inner =
      msg.ephemeralMessage?.message ??
      msg.viewOnceMessage?.message ??
      msg.viewOnceMessageV2?.message ??
      msg.viewOnceMessageV2Extension?.message ??
      msg.documentWithCaptionMessage?.message ??
      (msg.editedMessage?.message as proto.IMessage | undefined);
    if (!inner) break;
    msg = inner;
  }
  return msg;
}

/** Normalise a Baileys proto.IWebMessageInfo into the engine-agnostic shape. */
export function mapBaileysMessage(m: proto.IWebMessageInfo): WaMessageShape {
  if (!m.key) throw new Error('mapBaileysMessage: message missing key');
  const msg = unwrap(m.message);

  let wahaType = 'text';
  let body = '';
  let mediaMimetype: string | null | undefined;
  let mediaFilename: string | null | undefined;
  let location: WaMessageShape['location'];
  let quotedId: string | null | undefined;

  if (msg) {
    if (msg.conversation) {
      body = msg.conversation;
    } else if (msg.extendedTextMessage) {
      wahaType = 'text';
      body = msg.extendedTextMessage.text ?? '';
      quotedId = msg.extendedTextMessage.contextInfo?.stanzaId ?? undefined;
    } else if (msg.imageMessage) {
      wahaType = 'image';
      body = msg.imageMessage.caption ?? '';
      mediaMimetype = msg.imageMessage.mimetype;
      quotedId = msg.imageMessage.contextInfo?.stanzaId ?? undefined;
    } else if (msg.videoMessage) {
      wahaType = 'video';
      body = msg.videoMessage.caption ?? '';
      mediaMimetype = msg.videoMessage.mimetype;
      quotedId = msg.videoMessage.contextInfo?.stanzaId ?? undefined;
    } else if (msg.audioMessage) {
      wahaType = msg.audioMessage.ptt ? 'voice' : 'audio';
      mediaMimetype = msg.audioMessage.mimetype;
      quotedId = msg.audioMessage.contextInfo?.stanzaId ?? undefined;
    } else if (msg.documentMessage) {
      wahaType = 'document';
      body = msg.documentMessage.caption ?? '';
      mediaMimetype = msg.documentMessage.mimetype;
      mediaFilename = msg.documentMessage.fileName;
      quotedId = msg.documentMessage.contextInfo?.stanzaId ?? undefined;
    } else if (msg.stickerMessage) {
      wahaType = 'sticker';
      mediaMimetype = msg.stickerMessage.mimetype;
    } else if (msg.locationMessage) {
      wahaType = 'location';
      location = {
        latitude: msg.locationMessage.degreesLatitude ?? 0,
        longitude: msg.locationMessage.degreesLongitude ?? 0,
        name: msg.locationMessage.name ?? undefined,
      };
    } else if (msg.pollCreationMessage || msg.pollCreationMessageV3) {
      wahaType = 'poll_creation';
      body = (msg.pollCreationMessage ?? msg.pollCreationMessageV3)?.name ?? '';
    }
  }

  return {
    key: {
      remoteJid: m.key.remoteJid,
      fromMe: m.key.fromMe,
      id: m.key.id,
      senderPn: m.key.participant ?? undefined,
    },
    pushName: m.pushName ?? undefined,
    messageTimestamp: toNumber(m.messageTimestamp as LongLike),
    wahaType,
    body,
    mediaMimetype: mediaMimetype ?? undefined,
    mediaFilename: mediaFilename ?? undefined,
    location,
    quotedId,
  };
}

/** True when the mapped message carries downloadable binary media. */
export function isDownloadableMedia(type: string): boolean {
  return type === 'image' || type === 'video' || type === 'audio' || type === 'voice' || type === 'document' || type === 'sticker';
}
