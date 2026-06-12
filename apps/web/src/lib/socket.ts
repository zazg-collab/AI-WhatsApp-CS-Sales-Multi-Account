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

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${baseUrl()}/events`, {
      transports: ['websocket', 'polling'],
      auth: { token: getToken() ?? '' },
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[socket] connected', socket?.id);
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected:', reason);
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
