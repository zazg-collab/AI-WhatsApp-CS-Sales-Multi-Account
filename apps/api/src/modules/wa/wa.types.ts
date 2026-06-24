/**
 * Engine-agnostic inbound message shape. Replaces proto.IWebMessageInfo from
 * Baileys. WAHA normalises this from its WebSocket event payload.
 */
export interface WaMessageShape {
  key: {
    remoteJid: string | null | undefined;
    fromMe: boolean | null | undefined;
    id: string | null | undefined;
    /** Sender phone number in group chats (WAHA provides this pre-resolved) */
    senderPn?: string | null;
  };
  /** Display name of sender */
  pushName?: string | null;
  /** Unix timestamp in seconds */
  messageTimestamp?: number | null;
  /** WAHA message type string */
  wahaType: string;
  /** Extracted text body (WAHA pre-extracts this from all message types) */
  body: string;
  /** Accessible media URL served by WAHA (non-null when hasMedia is true) */
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

/** WAHA session status strings */
export type WahaSessionStatus =
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED'
  | 'STOPPED';
