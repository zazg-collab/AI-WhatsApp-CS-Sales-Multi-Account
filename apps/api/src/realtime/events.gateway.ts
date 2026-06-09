import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Single Socket.IO hub for pushing live updates to the dashboard
 * (PRD performance target: incoming message visible in < 2s).
 *
 * Events emitted:
 *   wa:status   { accountId, status }
 *   wa:qr       { accountId, qr }            // qr is a data-URL PNG
 *   message:new { conversationId, message }
 */
@WebSocketGateway({ cors: { origin: true }, namespace: '/events' })
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  emit(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
