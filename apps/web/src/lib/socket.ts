'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;

function baseUrl(): string {
  const api =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  // strip the /api/v1 suffix to reach the socket host
  return api.replace(/\/api\/v1\/?$/, '');
}

export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;
  if (!socket) {
    // The gateway now requires a JWT (C1) — pass it in the handshake auth.
    socket = io(`${baseUrl()}/events`, {
      // Allow polling as a fallback so the connection still works behind proxies
      // or when the websocket upgrade is blocked; socket.io upgrades to ws when it can.
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/** Drop the authenticated socket (e.g. on logout) so a fresh token is used. */
export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
