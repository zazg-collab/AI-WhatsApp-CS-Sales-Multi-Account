# Backend Refactoring Plan: WaService & ConversationsController

## Current State

### wa.service.ts (1,785 lines)
**God service problem:** Mixes three distinct concerns:

1. **Session Lifecycle** (330 lines)
   - `startSession(accountId)` — Baileys socket setup, auth state, reconnect
   - `onModuleInit()` — Initialize all sessions on startup
   - `restart(accountId)` — Graceful reconnect with backoff
   - `removeAccount(accountId)` — Cleanup session, creds, auth state
   - `healthCheck()` — Periodic health checks on all sockets
   - `getHealth(accountId)` — Per-account health status
   - `getQr(accountId)` — Latest QR code for pairing
   - `requestPairingCode(accountId)` — Pairing code alternative to QR

2. **Message/Chat Sending** (450 lines)
   - `sendText(accountId, phone, text, quotedMessageId)` — Text message with optional quote
   - `sendMedia(accountId, phone, url, mediaType, caption)` — Media via URL
   - `sendMediaBuffer(accountId, phone, buffer, mediaType, filename, caption)` — Media from buffer
   - `sendLocation(accountId, phone, lat, lng, name)` — Location sharing
   - `sendPoll(accountId, phone, question, options)` — Polls
   - `sendContacts(accountId, phone, contacts)` — Contact cards
   - `sendReaction(accountId, phone, externalId, emoji)` — React to message
   - `editMessage(accountId, phone, externalId, newText)` — Edit message
   - `deleteMessage(accountId, phone, externalId, fromMe)` — Delete message

3. **Chat Operations** (280 lines)
   - `setContactBlocked(accountId, phone, blocked)` — Block/unblock contact
   - `setChatMuted(accountId, phone, muted)` — Mute/unmute conversation
   - `setChatArchived(accountId, phone, archived)` — Archive conversation
   - `setChatPinned(accountId, phone, pinned)` — Pin conversation
   - `setMessageStarred(accountId, phone, externalId, starred)` — Star message
   - `setDisappearingMessages(accountId, phone, enabled, duration)` — Disappearing messages
   - `sendTyping(accountId, phone, typing)` — Typing indicator

4. **Utilities & Helpers** (250 lines)
   - `isConnected(accountId)` — Check connection status
   - `isOnWhatsApp(accountId, phone)` — Validate phone registration
   - `fetchAvatar(accountId, phone)` — Download profile picture
   - `markRead(accountId, phone, externalIds)` — Mark messages as read
   - Private helpers: `unwrapMessage()`, `resolveType()`, `longToNumber()`, `messageTimestamp()`

### conversations.controller.ts (475 lines, 38 endpoints)
**Controller god problem:** Too many concerns:
- Conversation CRUD (get, list, create)
- Message operations (send, edit, delete, react)
- Hermes integration (approve draft, block draft)
- State management (AI mode, takeover, labels, assignment, status)
- Media/location/poll sending
- Chat operations (mute, archive, pin, star, disappearing)
- Typing + search

## Proposed Solution

### Backend: Three Focused Services

#### **WaSessionService** (~300 lines)
```typescript
@Injectable()
export class WaSessionService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private events: EventsGateway,
    private notifications: NotificationsService,
  ) {}

  // Session lifecycle
  async startSession(accountId: string): Promise<void>
  async onModuleInit(): Promise<void>
  async restart(accountId: string): Promise<void>
  async removeAccount(accountId: string): Promise<void>

  // Health & pairing
  async healthCheck(): Promise<void>
  getHealth(accountId: string): SessionStatus
  getQr(accountId: string): string | null
  async requestPairingCode(accountId: string): Promise<string>
  isConnected(accountId: string): boolean

  // Validation
  async isOnWhatsApp(accountId: string, phone: string): Promise<boolean>
  async fetchAvatar(accountId: string, phone: string): Promise<string | null>
}
```
**Owned by:** Connection state, QR, pairing, reconnection logic, auth  
**Injected by:** `WaModule`, used by `WaMessagingService`

---

#### **WaMessagingService** (~400 lines)
```typescript
@Injectable()
export class WaMessagingService {
  constructor(
    private prisma: PrismaService,
    private wa: WaSessionService, // session provider
    private media: MediaStorageService,
    private config: ConfigService,
  ) {}

  // Text & media
  async sendText(accountId: string, phone: string, text: string, quotedMessageId?: string): Promise<string>
  async sendMedia(accountId: string, phone: string, url: string, ...): Promise<string>
  async sendMediaBuffer(accountId: string, phone: string, buffer: Buffer, ...): Promise<string>

  // Special message types
  async sendLocation(accountId: string, phone: string, lat: number, lng: number, name?: string): Promise<string>
  async sendPoll(accountId: string, phone: string, question: string, options: string[], selectableCount?: number): Promise<string>
  async sendContacts(accountId: string, phone: string, contacts: any[]): Promise<string>

  // Message mutations
  async sendReaction(accountId: string, phone: string, externalId: string, emoji: string): Promise<void>
  async editMessage(accountId: string, phone: string, externalId: string, newText: string): Promise<void>
  async deleteMessage(accountId: string, phone: string, externalId: string, fromMe: boolean): Promise<void>
  async markRead(accountId: string, phone: string, externalIds: string[]): Promise<void>
}
```
**Owned by:** Message sending, media upload, message editing  
**Injected by:** `ConversationMessagesController`, `ConversationsService`

---

#### **WaChatOpsService** (~280 lines)
```typescript
@Injectable()
export class WaChatOpsService {
  constructor(
    private wa: WaSessionService,
    private prisma: PrismaService,
  ) {}

  // Chat controls
  async setContactBlocked(accountId: string, phone: string, blocked: boolean): Promise<void>
  async setChatMuted(accountId: string, phone: string, muted: boolean): Promise<void>
  async setChatArchived(accountId: string, phone: string, archived: boolean): Promise<void>
  async setChatPinned(accountId: string, phone: string, pinned: boolean): Promise<void>

  // Message controls
  async setMessageStarred(accountId: string, phone: string, externalId: string, starred: boolean): Promise<void>
  async setDisappearingMessages(accountId: string, phone: string, enabled: boolean, duration?: number): Promise<void>

  // Presence
  async sendTyping(accountId: string, phone: string, typing: boolean): Promise<void>
}
```
**Owned by:** Chat state mutations (mute, archive, etc.)  
**Injected by:** `ConversationChatOpsController`

---

### Frontend: Split Controller

#### **ConversationsController** (40 lines)
```typescript
@Controller('conversations')
export class ConversationsController {
  constructor(private conversations: ConversationsService) {}

  @Get()
  list(@Query() filters: ListFilters) { ... }

  @Get(':id')
  get(@Param('id') id: string) { ... }

  @Post()
  create(@Body() dto: StartConversationDto) { ... }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: StatusDto) { ... }

  @Patch(':id/labels')
  setLabels(@Param('id') id: string, @Body() dto: LabelsDto) { ... }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignDto) { ... }

  @Get(':id/search')
  searchMessages(@Param('id') id: string, @Query('q') query: string) { ... }
}
```

#### **ConversationMessagesController** (80 lines)
```typescript
@Controller('conversations/:id/messages')
export class ConversationMessagesController {
  constructor(private conversations: ConversationsService) {}

  @Post()
  send(@Param('id') id: string, @Body() dto: SendMessageDto) { ... }

  @Patch(':messageId')
  editMessage(@Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: EditDto) { ... }

  @Delete(':messageId')
  deleteMessage(@Param('id') id: string, @Param('messageId') messageId: string) { ... }

  @Post(':messageId/react')
  reactToMessage(@Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: ReactionDto) { ... }

  @Post('media')
  sendMedia(@Param('id') id: string, @Body() dto: SendMediaDto) { ... }

  @Post('location')
  sendLocation(@Param('id') id: string, @Body() dto: LocationDto) { ... }

  @Post('poll')
  sendPoll(@Param('id') id: string, @Body() dto: PollDto) { ... }

  @Post('contacts')
  sendContacts(@Param('id') id: string, @Body() dto: ContactsDto) { ... }
}
```

#### **ConversationChatOpsController** (60 lines)
```typescript
@Controller('conversations/:id/chat-ops')
export class ConversationChatOpsController {
  constructor(private conversations: ConversationsService) {}

  @Patch('mute')
  setChatMuted(@Param('id') id: string, @Body() dto: MuteDto) { ... }

  @Patch('archive')
  setChatArchived(@Param('id') id: string, @Body() dto: ArchiveDto) { ... }

  @Patch('pin')
  setChatPinned(@Param('id') id: string, @Body() dto: PinDto) { ... }

  @Patch('block')
  setContactBlocked(@Param('id') id: string, @Body() dto: BlockDto) { ... }

  @Post('typing')
  sendTyping(@Param('id') id: string, @Body() dto: TypingDto) { ... }

  @Patch(':messageId/star')
  setMessageStarred(@Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: StarDto) { ... }

  @Patch('disappearing')
  setDisappearingMessages(@Param('id') id: string, @Body() dto: DisappearingDto) { ... }
}
```

#### **ConversationDraftsController** (30 lines)
```typescript
@Controller('conversations/:id/drafts')
export class ConversationDraftsController {
  constructor(private conversations: ConversationsService) {}

  @Post(':messageId/approve')
  approveDraft(@Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: ApproveDraftDto) { ... }

  @Post(':messageId/block')
  blockDraft(@Param('id') id: string, @Param('messageId') messageId: string) { ... }

  @Post('takeover')
  takeover(@Param('id') id: string, @Body() dto: TakeoverDto) { ... }
}
```

---

## Wiring in WaModule

```typescript
@Module({
  imports: [PrismaModule, RealtimeModule, ...],
  providers: [
    WaSessionService,      // session lifecycle
    WaMessagingService,    // message sending
    WaChatOpsService,      // chat operations
    WaService,             // facade/backward-compat (delegates to above 3)
    MessageIngestService,  // webhook receiver
    ContactSyncService,    // contact sync
    AutoAssignService,     // auto-assign logic
  ],
  controllers: [WaController, MediaController],
  exports: [WaService, WaSessionService, WaMessagingService, WaChatOpsService],
})
export class WaModule {}
```

---

## Wiring in ConversationsModule

```typescript
@Module({
  imports: [PrismaModule, WaModule, AiModule, HermesModule, ...],
  providers: [ConversationsService],
  controllers: [
    ConversationsController,          // GET/PATCH list, get, status, labels, assign
    ConversationMessagesController,   // send, edit, delete, react, media, location, poll
    ConversationChatOpsController,    // mute, archive, pin, block, star, disappearing, typing
    ConversationDraftsController,     // approve, block, takeover
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}
```

---

## Refactor Steps

1. Create `wa-session.service.ts` — copy session-related methods from `wa.service.ts`
2. Create `wa-messaging.service.ts` — copy send/edit/delete/react methods
3. Create `wa-chatops.service.ts` — copy chat operation methods
4. Update `wa.service.ts` — become a facade that delegates to the 3 services
5. Split `conversations.controller.ts` into 4 focused controllers
6. Update routes in `main.ts` or use route prefixes
7. Update tests to mock the 3 new services
8. Verify no breaking changes to API contracts
9. Deploy

---

## Timeline

- **Phase 1:** Create the 3 services + update module (2 hours)
- **Phase 2:** Split controllers + update routes (1 hour)
- **Phase 3:** Tests + verification (1 hour)
- **Phase 4:** Deploy + monitor (30 mins)

**Total:** ~4 hours of focused backend work

---

## Benefits

- `WaService` drops from 1,785 → ~100 lines (facade only)
- Each service has one clear responsibility
- Controllers are 40–80 lines (vs. 475 lines)
- Easier to test (mock individual services)
- Easier to extend (add new send type? extend `WaMessagingService`)
- Clearer API boundaries (users know exactly what each endpoint does)
- Safer refactoring (changes in one area less likely to affect others)
