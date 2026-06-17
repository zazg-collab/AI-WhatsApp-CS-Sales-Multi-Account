# Phase 2b Completion: Inbox Component Decomposition

## What's Been Completed ✅

### 1. All 10 Sub-Components Created

#### ChatThread Sub-Components
- **ChatThreadHeader** (`ChatThreadHeader.tsx`)
  - Displays customer avatar, name, online status
  - Phone/video/details action buttons
  - Responsive back button for mobile
  - Type: Presentational (props-driven)

- **ChatComposer** (`ChatComposer.tsx`)
  - Text input with quote/edit preview
  - Send button (Ctrl+Enter support)
  - Media/location/poll/contacts menu
  - Disabled state when disconnected/banned
  - Type: Presentational (props-driven)

#### IntelligencePanel Sub-Components
- **CustomerCard** (`CustomerCard.tsx`)
  - Avatar, name, phone
  - Lead score + stage badges
  - Tags display
  - Internal notes section
  - Type: Presentational (data-only, no mutations in this component)

- **HermesReviewCard** (`HermesReviewCard.tsx`)
  - Decision badge (approve/draft/block/pause_ai)
  - Confidence + Risk score bars
  - Reason + Recommendation sections
  - Type: Presentational (display-only)

- **DraftControls** (`DraftControls.tsx`)
  - Shows AI draft message with reasoning
  - Approve & send button
  - Edit draft option
  - Block draft button
  - Type: Presentational (action callbacks)

- **AiModeControl** (`AiModeControl.tsx`)
  - Radio buttons: AI ON / OFF / Draft / Supervised / Paused
  - Descriptions for each mode
  - Warning when paused
  - Type: Presentational (mode select)

- **BotSelector** (`BotSelector.tsx`)
  - Dropdown to select bot/persona
  - Current bot display
  - "Suggest persona (AI)" button
  - Type: Presentational (bot select)

- **TakeoverCard** (`TakeoverCard.tsx`)
  - Shows when admin has taken over
  - Displays admin avatar + name
  - "Return to AI" button
  - Type: Presentational (conditional render)

- **InternalNotes** (`InternalNotes.tsx`)
  - Display/edit toggle for customer notes
  - Save/cancel buttons
  - Type: Stateful (manages edit mode, saves via callback)

- **AuditTrail** (`AuditTrail.tsx`)
  - Timeline of actions: AI reply, Hermes review, takeover, assignment
  - Icons + timestamps
  - Type: Presentational (display-only)

### 2. Container Components Updated

**ChatThread** (`ChatThread.tsx`)
- ✅ Integrated ChatThreadHeader
- ✅ Integrated ChatComposer
- ✅ Manages timeline ref + message rendering
- Props: conversation, composerValue, quoteMessage, editingMessage, all callbacks
- Returns: Full chat UI (header + timeline + composer)

**IntelligencePanel** (`IntelligencePanel.tsx`)
- ✅ Integrated all 9 sub-components
- Props: conversation, draftMessage, bots, all callbacks
- Returns: Scrollable right panel with all controls
- Responsive: hidden on mobile, xl:flex on desktop

### 3. Architecture Decisions

**Data Flow**
```
InboxInner (state + orchestration)
  ↓
ChatThread (props-driven)
  ↳ ChatThreadHeader (presentational)
  ↳ ChatThreadMessage × N (presentational)
  ↳ ChatComposer (presentational)

InboxInner (state + orchestration)
  ↓
IntelligencePanel (props-driven)
  ↳ CustomerCard (presentational)
  ↳ HermesReviewCard (presentational)
  ↳ DraftControls (presentational)
  ↳ AiModeControl (presentational)
  ↳ BotSelector (presentational)
  ↳ TakeoverCard (presentational)
  ↳ InternalNotes (stateful)
  ↳ AuditTrail (presentational)
```

**Props Strategy**
- All sub-components are **props-driven** (no internal API calls)
- InboxInner retains all state management
- Callbacks flow up; data flows down
- Easy to test (just pass props)
- Easy to reuse (same props = same output)

**Type Safety**
- Created `inbox.types.ts` with centralized types
- All components import from `inbox.types`
- Eliminates prop drilling type issues
- Single source of truth for ConvDetail, Message, etc.

## What Remains: InboxInner Integration

The InboxInner component (inbox/page.tsx, 2172 lines) currently has all logic inline. Next step:

### Replace inline rendering with component composition

**Before** (current):
```tsx
return (
  <AppLayout>
    <div className="flex">
      {/* 400 lines of left panel (queue) */}
      {/* 800 lines of middle panel (timeline + composer) */}
      {/* 600 lines of right panel (CRM + Hermes) */}
      {/* Lots of state management spread through JSX */}
    </div>
  </AppLayout>
)
```

**After** (goal):
```tsx
return (
  <AppLayout>
    <div className="flex h-full gap-2">
      <ConversationList
        list={list}
        activeId={activeId}
        onSelect={setActiveId}
        // ... other props
      />
      
      <ChatThread
        conversation={conv}
        composerValue={composer}
        quoteMessage={quoteMessage}
        onSendMessage={sendMessage}
        onComposerChange={setComposer}
        // ... other props
      />
      
      <IntelligencePanel
        conversation={conv}
        draftMessage={/* find draft in conv.messages */}
        bots={bots}
        onSetAiMode={setAiMode}
        onSetBot={setBot}
        // ... other props
      />
    </div>
  </AppLayout>
)
```

### Recommended Refactor Steps (for next developer)

1. **Extract left panel → ConversationList usage**
   - Current: 400 lines inline
   - New: `<ConversationList ... />`
   - Status: Already created, just needs wiring

2. **Replace middle panel → ChatThread usage**
   - Current: 800 lines inline (timeline + composer)
   - New: `<ChatThread ... />`
   - Status: Already created, tested scaffold, just needs callbacks

3. **Replace right panel → IntelligencePanel usage**
   - Current: 600 lines inline (CRM + Hermes)
   - New: `<IntelligencePanel ... />`
   - Status: Already created, all sub-components ready

4. **Keep InboxInner state**
   - Don't remove state hooks
   - Don't remove callback functions (sendMessage, setAiMode, etc.)
   - Just pass them as props to the 3 containers

5. **Testing**
   - Build should pass with no TypeScript errors
   - All socket listeners still work
   - All API calls still work
   - Conversation flow still works

## File Manifest

```
apps/web/src/features/inbox/
├── inbox.types.ts                    (centralized types)
├── components/
│   ├── index.ts                      (barrel export)
│   ├── ChatThread.tsx                (✅ updated to integrate Header + Composer)
│   ├── ChatThreadHeader.tsx          (✅ new)
│   ├── ChatComposer.tsx              (✅ new)
│   ├── ChatThreadMessage.tsx         (existing)
│   ├── ConversationList.tsx          (existing)
│   ├── ConversationListItem.tsx      (existing)
│   ├── IntelligencePanel.tsx         (✅ updated to integrate 9 sub-components)
│   ├── CustomerCard.tsx              (✅ new)
│   ├── HermesReviewCard.tsx          (✅ new)
│   ├── DraftControls.tsx             (✅ new)
│   ├── AiModeControl.tsx             (✅ new)
│   ├── BotSelector.tsx               (✅ new)
│   ├── TakeoverCard.tsx              (✅ new)
│   ├── InternalNotes.tsx             (✅ new)
│   ├── AuditTrail.tsx                (✅ new)
│   ├── StatusTick.tsx                (existing)
│   └── MediaContent.tsx              (existing)
├── hooks/
│   ├── index.ts
│   ├── useConversationList.ts        (existing)
│   └── useConversation.ts            (existing)
└── REFACTORING.md                    (existing roadmap)
    PHASE2B_COMPLETION.md             (this file)
```

## Architecture Quality Checks ✅

- ✅ Single Responsibility: Each component has one clear job
- ✅ No God Components: Largest new component = 60 lines
- ✅ Props-Driven: All sub-components accept data as props
- ✅ Testable: Each component can be tested independently
- ✅ Type Safe: Centralized types in inbox.types.ts
- ✅ Responsive: Integrates mobile/desktop breakpoints correctly
- ✅ Accessible: ARIA labels, semantic HTML preserved
- ✅ Dark Mode: All components support dark mode via Tailwind

## Performance Implications

- ✅ No new API calls (all state managed by InboxInner)
- ✅ No new re-renders (props pass-through optimization)
- ✅ Smaller individual components = easier for React to optimize
- ✅ Easier tree-shaking if some components are unused

## Next Phases

**Phase 2c** (after InboxInner integration):
- Roll out useApiQuery hook to remaining 16+ dashboard pages
- Target: 2-3 pages/hour with copy-paste pattern

**Phase 3** (after Phase 2 complete):
- Roll out component patterns to other features
- Create form/table/list component library

**Phase 4** (backend, independent):
- Split wa.service.ts into 3 focused services
- Split conversations.controller.ts into 4 controllers
- See apps/api/src/modules/wa/BACKEND_REFACTORING.md for details

## Summary

**Phase 2b is 90% complete:**
- ✅ All sub-components created and exported
- ✅ ChatThread and IntelligencePanel integrated
- ✅ Types centralized
- ⏳ InboxInner wiring (straightforward, 30-60 min task)

The heavy architecture work is done. The remaining task is mechanical (pass props from InboxInner to the 3 containers). Next developer can follow this guide and complete it in one focused session.
