/**
 * Lightweight CJS stub for the ESM-only @whiskeysockets/baileys package, used
 * only under jest (mapped via moduleNameMapper). Unit tests never exercise a
 * real socket; this just lets modules that `import` baileys load without jest
 * choking on its ESM entrypoint. The real package is used at runtime/build.
 */
export default function makeWASocket() {
  throw new Error('baileys makeWASocket is stubbed under test');
}

export const DisconnectReason = { loggedOut: 401 };
export const Browsers = { macOS: (_: string) => ['Test', 'Desktop', '1.0'] };
export const downloadMediaMessage = async () => Buffer.from('');
export const useMultiFileAuthState = async () => ({ state: {}, saveCreds: async () => undefined });
export const fetchLatestBaileysVersion = async () => ({ version: [2, 0, 0] });
export const proto = {} as Record<string, unknown>;
export type WASocket = unknown;
