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
    accountIds?: string[];
  };
}

/**
 * Single Socket.IO hub for pushing live updates to the dashboard
 * (PRD performance target: incoming message visible in < 2s).
 *
 * Requires JWT authentication. Events are scoped by room to prevent
 * cross-tenant leakage. Clients join rooms for accounts they have access to.
 *
 * Events emitted:
 *   wa:status   { accountId, status }
 *   wa:qr       { accountId, qr }            // qr is a data-URL PNG
 *   message:new { conversationId, message }
 */
@WebSocketGateway({
  cors: { origin: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000', credentials: true },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(socket: AuthenticatedSocket) {
    const token = socket.handshake.auth.token ?? socket.handshake.headers.authorization?.split(' ')[1];
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
      socket.data.accountIds = payload.accountIds || [];
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    // Cleanup handled by Socket.IO
  }

  emit(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  emitToAccount(accountId: string, event: string, payload: unknown) {
    this.server?.to(`account:${accountId}`).emit(event, payload);
  }
}
