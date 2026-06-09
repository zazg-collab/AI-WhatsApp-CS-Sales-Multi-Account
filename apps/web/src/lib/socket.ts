'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function baseUrl(): string {
  const api =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  // strip the /api/v1 suffix to reach the socket host
  return api.replace(/\/api\/v1\/?$/, '');
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${baseUrl()}/events`, { transports: ['websocket'] });
  }
  return socket;
}
