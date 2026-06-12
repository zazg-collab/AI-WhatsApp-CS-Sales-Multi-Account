import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    role?: string;
  };
}

/** Room that receives every account's events (owner/supervisor/viewer). */
const ALL_ACCOUNTS_ROOM = 'accounts:all';

const accountRoom = (accountId: string) => `account:${accountId}`;

/**
 * Single Socket.IO hub for pushing live updates to the dashboard
 * (PRD performance target: incoming message visible in < 2s).
 *
 * Authentication (C1): every connection must present a valid JWT (via
 * `auth.token` in the handshake, or an Authorization bearer header).
 * Unauthenticated sockets are disconnected immediately.
 *
 * Room scoping (cross-account isolation): events are emitted per WhatsApp
 * account via `emitToAccount`. On connect, owner/supervisor/viewer join the
 * all-accounts room; an admin joins only the rooms of accounts assigned to
 * them (plus unassigned accounts, which no other admin has claimed). Rooms
 * are computed at connect time — assignment changes apply on reconnect.
 *
 * Events emitted:
 *   wa:status     { accountId, status }
 *   wa:qr         { accountId, qr }            // qr is a data-URL PNG
 *   message:new   { conversationId, message }
 *   message:draft { conversationId, message }
 *   hermes:alert  { conversationId, review }
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
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: AuthenticatedSocket) {
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
      return;
    }

    try {
      await this.joinRooms(socket);
    } catch {
      // Fail closed: a socket with no rooms receives nothing.
      socket.disconnect();
    }
  }

  private async joinRooms(socket: AuthenticatedSocket) {
    if (socket.data.role !== 'admin') {
      // owner/supervisor have full oversight; viewer is read-only across all.
      await socket.join(ALL_ACCOUNTS_ROOM);
      return;
    }
    // Admins see only their accounts. Unassigned accounts are included so a
    // pilot with no explicit assignment still works; an account claimed by
    // another admin is invisible.
    const accounts = await this.prisma.whatsappAccount.findMany({
      where: {
        OR: [{ assignedAdminId: socket.data.userId }, { assignedAdminId: null }],
      },
      select: { id: true },
    });
    await socket.join(accounts.map((account) => accountRoom(account.id)));
  }

  handleDisconnect() {
    // Cleanup handled by Socket.IO.
  }

  /**
   * Emit an event scoped to one WhatsApp account: delivered to that account's
   * room and to the all-accounts room. Pass null only for genuinely global
   * events, which then reach privileged roles alone.
   */
  emitToAccount(accountId: string | null, event: string, payload: unknown) {
    if (!this.server) return;
    if (accountId) {
      this.server.to(accountRoom(accountId)).to(ALL_ACCOUNTS_ROOM).emit(event, payload);
    } else {
      this.server.to(ALL_ACCOUNTS_ROOM).emit(event, payload);
    }
  }

  /** @deprecated Use emitToAccount. Reaches privileged roles only. */
  emit(event: string, payload: unknown) {
    this.emitToAccount(null, event, payload);
  }
}
