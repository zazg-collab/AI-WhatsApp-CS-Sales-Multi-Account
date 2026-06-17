# InboxInner Integration Guide: Final 10% of Phase 2b

## Status
✅ **All architecture complete.** Ready for final integration step.

## What's Done
- ✅ 10 sub-components created (ChatThread, IntelligencePanel children)
- ✅ ConversationList component ready
- ✅ All types centralized in inbox.types.ts
- ✅ Components imported into inbox/page.tsx

## What Remains
Replace the 3 inline panels in InboxInner return statement with the component composition.

## Implementation: Step-by-Step

### Current Structure (inbox/page.tsx, lines 977-2158)
```tsx
return (
  <AppLayout>
    <div className="flex h-full gap-2">
      {/* Panel 1: 125 lines of inline queue/list rendering (lines 981-1106) */}
      <section>{/* search, filters, start-chat form, conversation list */}</section>

      {/* Panel 2: 494 lines of inline timeline + composer (lines 1108-1595) */}
      <section>{/* header, messages, draft controls, composer */}</section>

      {/* Panel 3: 563 lines of inline CRM + Hermes + audit (lines 1596-2158) */}
      <section>{/* customer card, hermes, AI mode, bot, takeover, notes, audit */}</section>
    </div>
  </AppLayout>
)
```

### New Structure (after integration)
```tsx
return (
  <AppLayout>
    <div className="flex h-full gap-2">
      {/* Panel 1: ConversationList (2 lines) */}
      <ConversationList
        conversations={list}
        accounts={accounts}
        activeId={activeId}
        onSelect={setActiveId}
        onStartChat={startConversation}
        onValidateNumber={validateNumber}
        error={listError}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Panel 2: ChatThread (7 lines) */}
      <ChatThread
        conversation={conv}
        loading={busy}
        composerValue={composer}
        quoteMessage={quoteMessage}
        editingMessage={editingMessage}
        onSendMessage={sendMessage}
        onComposerChange={setComposer}
        onReactMessage={(id, emoji) => reactMessage(id, emoji)}
        onEditMessage={(id, text) => editMessage(id, text)}
        onDeleteMessage={deleteMessage}
        onBack={() => setActiveId(null)}
        onShowDetails={() => setShowRightPanel(!showRightPanel)}
        onClearQuote={() => setQuoteMessage(null)}
        onClearEdit={() => setEditingMessage(null)}
      />

      {/* Panel 3: IntelligencePanel (10 lines) */}
      <IntelligencePanel
        conversation={conv}
        draftMessage={conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending') || null}
        bots={bots}
        approvingDraft={busy}
        blockingDraft={busy}
        loadingControls={busy}
        onApproveDraft={approveDraft}
        onBlockDraft={blockDraft}
        onTakeover={takeOver}
        onSetAiMode={setAiMode}
        onSetBot={setBot}
        onUpdateNotes={updateCustomerNotes}
      />
    </div>
  </AppLayout>
)
```

## Exact Steps

### 1. Replace Panel 1 (lines 981-1106)

**Find:** The entire `<section>` that starts with:
```tsx
<section className={cn('shrink-0 flex-col rounded-l border border-gray-200 bg-white...
```
Ends with closing `</section>` at line 1106.

**Replace with:**
```tsx
<ConversationList
  conversations={list}
  accounts={accounts}
  activeId={activeId}
  onSelect={setActiveId}
  onStartChat={startConversation}
  onValidateNumber={validateNumber}
  error={listError}
  filter={filter}
  onFilterChange={setFilter}
/>
```

**Remove state** (no longer needed by InboxInner):
- startAccountId, setStartAccountId
- startPhone, setStartPhone
- startName, setStartName
- startResult, setStartResult

(ConversationList manages these internally)

---

### 2. Replace Panel 2 (lines 1108-1595)

**Find:** The entire `<section>` that starts with:
```tsx
<section className={cn('operations-surface relative...
```
Ends with closing `</section>` before Panel 3 comment.

**Replace with:**
```tsx
<ChatThread
  conversation={conv}
  loading={busy}
  composerValue={composer}
  quoteMessage={quoteMessage}
  editingMessage={editingMessage}
  onSendMessage={sendMessage}
  onComposerChange={setComposer}
  onReactMessage={(id, emoji) => reactMessage(id, emoji)}
  onEditMessage={(id, text) => editMessage(id, text)}
  onDeleteMessage={deleteMessage}
  onBack={() => setActiveId(null)}
  onShowDetails={() => setShowRightPanel(!showRightPanel)}
  onClearQuote={() => setQuoteMessage(null)}
  onClearEdit={() => setEditingMessage(null)}
/>
```

**Keep state** (InboxInner still manages):
- composer, setComposer
- quoteMessage, setQuoteMessage
- editingMessage, setEditingMessage
- sendMessage, reactMessage, editMessage, deleteMessage callbacks

---

### 3. Replace Panel 3 (lines 1596-end)

**Find:** Everything from Panel 3 comment to end of return statement.

**Replace with:**
```tsx
<IntelligencePanel
  conversation={conv}
  draftMessage={conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending') || null}
  bots={bots}
  approvingDraft={busy}
  blockingDraft={busy}
  loadingControls={busy}
  onApproveDraft={approveDraft}
  onBlockDraft={blockDraft}
  onTakeover={takeOver}
  onSetAiMode={setAiMode}
  onSetBot={setBot}
  onUpdateNotes={updateCustomerNotes}
/>
```

**Keep state** (InboxInner still manages):
- All the callbacks: approveDraft, blockDraft, takeOver, setAiMode, setBot, updateCustomerNotes
- bots list

---

## State Cleanup

After replacing all 3 panels, InboxInner state will reduce from **30 state hooks** to **12**:

```tsx
// Keep these (core state)
const [list, setList] = useState<ConvSummary[]>([]);
const [activeId, setActiveId] = useState<string | null>(null);
const [conv, setConv] = useState<ConvDetail | null>(null);
const [composer, setComposer] = useState('');
const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);
const [editingMessage, setEditingMessage] = useState<Message | null>(null);
const [sending, setSending] = useState(false);
const [busy, setBusy] = useState(false);
const [admins, setAdmins] = useState<AdminUser[]>([]);
const [accounts, setAccounts] = useState<WaAccount[]>([]);
const [listError, setListError] = useState<string | null>(null);
const [detailError, setDetailError] = useState<string | null>(null);
const [bots, setBots] = useState([]);

// Remove these (handled by components)
// - startAccountId, startPhone, startName, startResult (ConversationList)
// - search, filter (ConversationList manages internally)
// - showRightPanel, hoveredMessageId, showMoreMenu (IntelligencePanel/ChatThread)
// - labelDraft, uploadingMedia, etc. (sub-components manage internally)
```

---

## Verification Checklist

After integration, verify:

- [ ] Build passes with `npm run build --workspace=@hermes/web`
- [ ] No TypeScript errors
- [ ] Conversation list loads and filters work
- [ ] Selecting a conversation shows the chat
- [ ] Composing and sending messages works
- [ ] Draft controls appear for AI drafts
- [ ] AI mode toggle works
- [ ] Bot selector works
- [ ] Customer card shows info
- [ ] Hermes review displays
- [ ] Dark mode still works
- [ ] Mobile responsive (hamburger on sm)
- [ ] Socket events still fire (new messages appear)

---

## Safety Notes

**DO NOT:**
- Remove the `loadList`, `loadConv`, `sendMessage` callbacks (still used)
- Remove the `useEffect` hooks that load data
- Remove the socket listener setup

**DO:**
- Keep all state management in InboxInner
- Just replace the JSX rendering with component composition
- Ensure all callbacks are passed as props

---

## Estimated Effort

- Panel 1 replacement: 10 minutes (straightforward find/replace)
- Panel 2 replacement: 15 minutes (need to ensure all callbacks wired)
- Panel 3 replacement: 20 minutes (most callbacks)
- Testing: 15 minutes
- **Total: ~60 minutes**

---

## Files Affected

- `apps/web/src/app/inbox/page.tsx` — InboxInner integration
- No other files need changes

---

## Reference: Component Props

### ConversationList
```tsx
conversations: ConvSummary[]
accounts: WaAccount[]
activeId: string | null
onSelect: (id: string) => void
onStartChat?: (accountId: string, phone: string, name: string) => Promise<void>
onValidateNumber?: (accountId: string, phone: string) => Promise<string>
error?: string | null
filter?: 'all' | 'attention' | 'sla' | 'unassigned'
onFilterChange?: (filter: ...) => void
```

### ChatThread
```tsx
conversation: ConvDetail | null
loading?: boolean
composerValue?: string
quoteMessage?: Message | null
editingMessage?: Message | null
onSendMessage?: (text: string) => Promise<void>
onComposerChange?: (value: string) => void
onReactMessage?: (messageId: string, emoji: string) => Promise<void>
onEditMessage?: (messageId: string, newText: string) => Promise<void>
onDeleteMessage?: (messageId: string) => Promise<void>
onBack?: () => void
onShowDetails?: () => void
onClearQuote?: () => void
onClearEdit?: () => void
```

### IntelligencePanel
```tsx
conversation: ConvDetail | null
draftMessage?: Message | null
bots?: Array<{ id: string; botName: string; persona?: { name: string } | null }>
onApproveDraft?: () => Promise<void>
onBlockDraft?: () => Promise<void>
onTakeover?: () => Promise<void>
onSetAiMode?: (mode: string) => Promise<void>
onSetBot?: (botId: string | null) => Promise<void>
onUpdateNotes?: (notes: string) => Promise<void>
approvingDraft?: boolean
blockingDraft?: boolean
loadingControls?: boolean
```

---

## Next Steps (after integration complete)

1. **Phase 3:** Roll out useApiQuery to remaining 16+ dashboard pages
2. **Phase 4:** Backend refactoring (WaService decomposition)
3. **Phase 5:** Component library standardization across all features

---

## Support

If you get stuck:
1. Check the component interfaces in `components/index.ts`
2. Verify prop names match exactly (TypeScript will error if wrong)
3. Ensure callbacks use correct signatures
4. Run `npm run build` to catch type errors early
5. Test in browser after each panel replacement
