import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    role?: string;
  };
}

/**
 * Single Socket.IO hub for pushing live updates to the dashboard
 * (PRD performance target: incoming message visible in < 2s).
 *
 * Authentication (C1): every connection must present a valid JWT (via
 * `auth.token` in the handshake, or an Authorization bearer header).
 * Unauthenticated sockets are disconnected immediately, closing the
 * previously-open leak of messages, drafts, QR codes, and alerts.
 *
 * Events emitted:
 *   wa:status   { accountId, status }
 *   wa:qr       { accountId, qr }            // qr is a data-URL PNG
 *   message:new { conversationId, message }
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(socket: AuthenticatedSocket) {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.headers.authorization?.split(' ')[1];
    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret) {
        socket.disconnect();
        return;
      }
      const payload = this.jwt.verify(token, { secret });
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect() {
    // Cleanup handled by Socket.IO.
  }

  emit(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
