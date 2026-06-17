# Inbox Refactoring Roadmap

The inbox feature is being decomposed from a 2,256-line monolithic page into a modular feature with clear concerns. This document tracks progress and next steps.

## Current Status

### ✅ Completed
- `StatusTick.tsx` — message delivery status indicators
- `MediaContent.tsx` — image/video/audio/document rendering
- `ConversationListItem.tsx` — individual conversation row
- `ChatThreadMessage.tsx` — individual message bubble
- `useConversationList` hook — queue data + filtering
- `useConversation` hook — single conversation + message stream
- `useApiQuery` hook — shared data-fetching pattern
- `inbox.types.ts` — centralized conversation/message types

### 🚧 In Progress
The main `InboxInner` component (2,000+ lines) still exists in `/app/inbox/page.tsx`. The extracted components above are ready to use, but the orchestration logic hasn't been refactored yet.

### ⏳ Next Steps

#### Phase 2b: Extract Container Components
These components will use the hooks and delegated components to render the UI.

1. **`ConversationList.tsx`**
   - Uses: `useConversationList`, `ConversationListItem`, `useApiQuery` for accounts
   - Renders: search + filters + start-chat form + conversation queue
   - Owns: search/filter state, account list, start conversation flow
   - **Dependencies:** Most of the "start conversation" logic lives inline in `InboxInner` (validateNumber, startConversation, etc.)

2. **`ChatThread.tsx`**
   - Uses: `useConversation`, `ChatThreadMessage`, socket for live messages
   - Renders: message timeline + composer
   - Owns: message timeline, media upload, quick replies, reactions, edit/delete
   - **Dependencies:** Heavy—draft controls, AI mode logic, takeover state, Hermes review, schedules, follow-ups all live here

3. **`IntelligencePanel.tsx`**
   - Uses: `useConversation` data
   - Renders: customer panel (notes, tags, lead score, avatar), Hermes review, draft controls, audit trail
   - Owns: display logic for intelligent insights
   - **Dependencies:** Minimal—mostly reads from `ConversationDetail`

4. **`InboxPage.tsx`** (container/layout)
   - Uses: `useConversationList`, `useConversation`, responsive state
   - Renders: layout shell, all 3 panels, mobile drawer for right panel
   - Owns: route params (`?conversation=`), mobile panel toggle
   - **Dependencies:** All the panels

#### Phase 3: Eliminate Duplication Across All Pages
Once the pattern is proven in inbox, roll out `useApiQuery` to:
- `accounts/page.tsx` (39 useState)
- `campaigns/page.tsx` (20 useState)
- `customers/page.tsx` (19 useState)
- ... and 15 other dashboard pages

Each page should drop to ~5-8 useState after migration.

#### Phase 4: Backend Refactoring (Optional)
- Split `WaService` into `WaSessionService` + `WaMessagingService` + `WaChatsOpsService`
- Split `ConversationsController` into 3 concern-based controllers
- Reduces file size and improves maintainability

---

## Key Challenges

### 1. State Coupling
`InboxInner` has ~40 useState declarations that are tightly coupled:
- `composer` + `sending` + `sendError` form a cluster
- `scheduleMsg` + `scheduleAt` + `showSchedule` form another
- Suggest extracting these into custom hooks: `useComposer`, `useScheduler`, etc.

### 2. Event Handlers
Many handlers are defined inline (`sendMessage`, `approveDraft`, `reactToMessage`, etc.) and reference multiple state vars. When extracting, these should live in the hooks they depend on.

### 3. Socket Integration
Real-time updates come through `socket.on('message:new', ...)`. Currently wired directly in `useEffect` in `InboxInner`. The hooks (`useConversationList`, `useConversation`) have placeholder socket integration; ensure they're properly subscribed/unsubscribed.

### 4. Mobile Responsiveness
The layout uses Tailwind's `hidden sm:flex` / `hidden md:flex` extensively. The container component must handle:
- Mobile: show list OR chat (not both)
- Tablet: show list + chat
- Desktop: show list + chat + intelligence panel
- Mobile drawer overlay for right panel

---

## Extraction Pattern

Each component should follow this structure:

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import type { ConvSummary } from '../inbox.types';

export interface ConversationListProps {
  conversations: ConvSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  loading,
  error,
}: ConversationListProps) {
  const t = useT(dict);
  
  return (
    <section className="...">
      {/* ... */}
    </section>
  );
}
```

**Key principles:**
- Props-driven: accept data and callbacks, don't fetch
- Hooks for complex state (useCallback, etc.), but not for data
- Types exported alongside component
- Single responsibility: render one logical section

---

## Testing Strategy

As components are extracted, add `*.test.tsx` alongside:
- `ConversationListItem.test.tsx` — test status display, click handling
- `ChatThreadMessage.test.tsx` — test reactions, edit/delete buttons
- `useConversationList.test.ts` — mock API, test search/filter
- `useConversation.test.ts` — mock socket, test message stream

The `InboxPage` integration test will be the last (combines all pieces).

---

## References

- CLAUDE.md: Frontend conventions
- `lib/hooks/useApiQuery.ts`: Shared data-fetching pattern
- `features/*/` — example feature module structure (see components, hooks, types)
