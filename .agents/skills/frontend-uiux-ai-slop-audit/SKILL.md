---
name: frontend-uiux-ai-slop-audit
description: Use when auditing frontend, UI/UX, dashboard screens, landing pages, forms, chat interfaces, design systems, responsive behavior, accessibility, microcopy, and AI-generated interface designs. Detects UI that looks polished but is generic, unclear, unusable, inconsistent, or only works on the happy path.
---

# Frontend UI/UX AI Slop Audit Skill

Use this skill to audit frontend and UI/UX output created by AI or humans.

This skill is intentionally **not** a backend, database, security, or fullstack production audit. It focuses only on frontend, UI, UX, interaction quality, copy, component quality, responsive behavior, accessibility, and AI-generated interface slop.

AI slop in frontend/UI/UX means:

- visually polished but strategically empty
- modern-looking but generic
- clean but unclear
- aesthetic but not usable
- dashboard-heavy but decision-poor
- component-rich but inconsistent
- responsive only in theory
- no loading, empty, error, disabled, or edge states
- copy that sounds professional but says nothing
- frontend code that works in demo but breaks with real data

## Core Principle

Do not judge UI by screenshot quality. Judge it by clarity, hierarchy, usability, specificity, accessibility, responsiveness, real-data resilience, state completeness, component maintainability, and alignment with product goal.

A beautiful interface that does not help the user act is still slop.

---

## 1. Audit Output Format

Use this format:

```text
Frontend UI/UX AI Slop Audit

Overall Slop Risk: Low / Medium / High / Critical

Executive Summary:
- ...

Top Problems:
1. ...
2. ...
3. ...

UI/UX Findings:
- ...

Information Architecture:
- ...

Visual Hierarchy:
- ...

Microcopy:
- ...

Component System:
- ...

Responsive Behavior:
- ...

Accessibility:
- ...

Frontend Implementation:
- ...

Missing States:
- ...

Priority Fixes:
1. ...
2. ...
3. ...

Final Verdict:
approve / revise / redesign / block
```

Each finding must include:

```text
Problem:
Why it matters:
Example:
Fix:
```

---

## 2. Main AI Slop Signals

Flag UI as AI slop when:

### Generic visual slop

- Looks like a SaaS template.
- Uses random gradient cards.
- Has decorative glassmorphism without purpose.
- Uses trendy but irrelevant visuals.
- Has no distinct product personality.
- Looks interchangeable with many other AI-generated dashboards.
- Uses modern aesthetics as a substitute for product clarity.

### UX slop

- User goal is unclear.
- Primary action is buried.
- Page has too many equal-priority sections.
- User must think too hard to understand what to do.
- The layout is beautiful but the flow is weak.
- There is no clear decision path.
- The interface answers “what can we show?” instead of “what should the user do?”

### Dashboard slop

- Too many cards.
- Metrics are shown without interpretation.
- Charts exist only to fill space.
- No alert priority.
- No “what needs attention now”.
- No distinction between normal, warning, danger, pending, and failed.
- Admin gets data but not direction.

### Copy slop

Reject generic copy like:

```text
Welcome back
Manage your business efficiently
Unlock your potential
Transform your workflow
Seamless experience
Powerful dashboard
Get Started
Learn More
Submit
```

Better copy is specific:

```text
Review risky replies
Approve campaign draft
Reconnect WhatsApp account
Reply to waiting customer
Fix failed message send
Schedule follow-up
View pending approvals
```

### Frontend implementation slop

- One giant component.
- API calls mixed with UI.
- Validation mixed with rendering.
- No reusable primitives.
- No error boundary.
- No empty state.
- No skeleton/loading plan.
- Hardcoded fake data.
- Tailwind classes copied everywhere without abstraction.
- Buttons built with divs.
- Forms without labels.
- Tables unusable on mobile.

---

## 3. Product Fit Audit

For every screen, answer:

```text
Who is this screen for?
What is the user trying to do?
What is the one primary action?
What information must appear first?
What should be hidden or secondary?
What does success look like?
What can go wrong?
```

Flag slop when the UI cannot answer these questions. A screen is not good because it has sections. A screen is good because it helps a specific user complete a specific job.

---

## 4. Information Architecture Audit

Check:

- Is information grouped by user decision?
- Are sections ordered by importance?
- Are labels understandable?
- Is navigation predictable?
- Are advanced actions hidden until needed?
- Are destructive actions separated?
- Are filters and search meaningful?
- Is the page scannable in 5 seconds?

Flag slop when:

- Everything is visible at once.
- Cards are used for unrelated items.
- Same visual treatment is used for primary and secondary data.
- Navigation names are vague.
- User has to read everything before acting.
- Important actions are separated from the related object.

---

## 5. Visual Hierarchy Audit

Check:

- One clear primary focus per screen.
- CTA is visually obvious.
- Risk/urgent items stand out.
- Secondary actions are visually quieter.
- Typography scale is consistent.
- Spacing follows a system.
- Color has meaning, not decoration.
- Icons support meaning, not decoration.

Flag slop when:

- Every card has the same emphasis.
- Too many colors compete.
- Shadows and gradients are random.
- Important alerts look like normal cards.
- CTA is hidden below decorative content.
- Typography sizes feel random.
- Empty whitespace hides lack of product thinking.

---

## 6. Microcopy Audit

Good microcopy should reduce confusion, explain consequences, guide next action, show recovery path, use domain-specific language, and avoid hype.

Bad:

```text
Something went wrong.
```

Better:

```text
Gagal memuat daftar customer. Coba lagi atau periksa koneksi.
```

Bad:

```text
Submit
```

Better:

```text
Simpan perubahan
Kirim balasan
Setujui campaign
Minta review admin
```

Bad:

```text
No data found.
```

Better:

```text
Belum ada campaign. Buat draft campaign pertama untuk mulai mengirim pesan terkontrol.
```

---

## 7. State Completeness Audit

Every important UI must include:

- default state
- loading state
- empty state
- error state
- success state
- disabled state
- validation error state
- permission denied state
- offline/disconnected state when relevant
- stale data state when relevant
- partial data state when relevant
- pending approval state when relevant
- failed action state when relevant
- retry state when relevant

Flag high slop risk when UI only shows the ideal state. Real products live in bad states. Demo products only live in happy states.

---

## 8. Responsive Audit

Check mobile behavior:

- Does the primary action remain visible?
- Are tables usable?
- Do cards stack logically?
- Is text still readable?
- Are tap targets large enough?
- Do modals fit the viewport?
- Does sidebar collapse cleanly?
- Are filters usable on mobile?
- Does the page avoid horizontal scroll?

Flag slop when:

- Desktop is simply squeezed.
- Important action disappears.
- Table overflows.
- Modal is taller than screen.
- Button groups become cramped.
- Chat layout breaks on small devices.
- Filters become unusable.
- Sticky elements cover content.

---

## 9. Accessibility Audit

Check:

- Semantic HTML.
- Buttons use `<button>`.
- Links use `<a>`.
- Inputs have labels.
- Form errors are connected to fields.
- Keyboard navigation works.
- Focus states are visible.
- Color contrast is readable.
- Icons have text or accessible labels.
- Modal focus is trapped.
- Toasts/alerts are perceivable.

Flag slop when:

- Clickable divs.
- Placeholder-only labels.
- Removed focus outline.
- Color-only error indicators.
- Icons without labels.
- Modal cannot be used by keyboard.
- Form error only appears visually without field association.

---

## 10. Component System Audit

Check:

- Is there a reusable button system?
- Are input states consistent?
- Are card variants intentional?
- Are badges meaningful?
- Is spacing standardized?
- Are colors tokenized?
- Is typography standardized?
- Are icons consistent?
- Are loading/error/empty components reusable?

Flag slop when:

- Every page invents its own button.
- Radius, shadow, and spacing are random.
- Tailwind classes are repeated without abstraction.
- Components are named by appearance instead of purpose.
- UI primitives and domain components are mixed.
- Variants exist only because AI generated them.

Good structure:

```text
components/ui/Button.tsx
components/ui/Input.tsx
components/ui/Card.tsx
components/ui/EmptyState.tsx
components/ui/ErrorState.tsx
components/conversations/ConversationList.tsx
components/conversations/MessageComposer.tsx
components/campaigns/CampaignApprovalCard.tsx
features/conversations/api.ts
features/conversations/types.ts
features/conversations/hooks.ts
```

---

## 11. Frontend Code Audit

Check:

- API calls are separated.
- Components are small.
- Props are typed.
- Validation is schema-based.
- Formatting helpers are separate.
- State is not duplicated unnecessarily.
- Side effects are controlled.
- Loading and error are handled.
- Optimistic UI is safe.
- Realtime updates do not cause refetch storms.

Flag slop when:

- Component file is huge.
- `useEffect` becomes business logic dumping ground.
- API response shape is guessed.
- `any` is used to silence TypeScript.
- Error is `console.log` only.
- Fake data remains in production code.
- Complex conditional rendering is unreadable.
- Business rules exist only in the UI.

---

## 12. Landing Page AI Slop Audit

Flag landing pages when:

- Hero headline is generic.
- Value proposition is unclear.
- Target user is not obvious.
- CTA is vague.
- Benefits are abstract.
- Social proof is fake or decorative.
- Pricing/offer section hides key details.
- FAQ avoids real objections.
- Page looks nice but does not build trust.

Bad hero:

```text
Transform Your Business with AI-Powered Solutions
```

Better hero:

```text
Kelola banyak akun WhatsApp CS dan Sales dari satu dashboard dengan review AI sebelum pesan berisiko terkirim.
```

---

## 13. Dashboard AI Slop Audit

A dashboard must answer:

```text
What needs attention now?
What changed recently?
What is blocked?
What is risky?
What should admin do next?
```

Flag dashboard slop when:

- It only displays numbers.
- It does not prioritize risk.
- It has charts without decisions.
- Alerts are hidden.
- Failed/pending items are not actionable.
- Admin has to inspect every page manually.

Good dashboard cards:

```text
12 balasan menunggu review
3 akun WhatsApp disconnected
5 campaign pending approval
8 pesan gagal terkirim
2 percakapan perlu takeover
```

Bad dashboard cards:

```text
Total Users
Total Messages
Total Revenue
Performance
Growth
```

Unless tied to decisions, they are decoration.

---

## 14. Form UX Audit

Check:

- Form has clear purpose.
- Fields are ordered logically.
- Labels are specific.
- Required fields are obvious.
- Error messages explain fix.
- Submit action describes consequence.
- Dangerous submit requires confirmation.
- User does not lose input after error.
- Validation runs at the right time.

Flag slop when:

- Form has too many fields.
- Error says only “invalid”.
- Submit button is vague.
- No success confirmation.
- No prevention for duplicate submit.
- No loading state on submit.

---

## 15. Table/List UX Audit

Check:

- Columns are necessary.
- Primary identifier is clear.
- Status is readable.
- Actions are close to row.
- Bulk actions are safe.
- Empty state is useful.
- Pagination exists for large data.
- Filters match real workflow.
- Mobile alternative exists.

Flag slop when:

- Too many columns.
- Important status hidden.
- Actions are generic icons only.
- No bulk action confirmation.
- Table unusable on mobile.
- Search/filter does not match user intent.

---

## 16. Chat UI Audit

For chat/conversation UI, check:

- Latest message is obvious.
- AI mode is visible.
- Human takeover state is visible.
- Draft vs sent message is clear.
- Risky AI reply requires review.
- Customer context is visible.
- Internal note is separated from customer message.
- Failed send can be retried.
- Attachment/media state is clear.
- Composer has disabled reasons.

Flag slop when:

- AI draft looks like sent message.
- Admin cannot see why AI suggested a reply.
- Takeover state is hidden.
- Internal notes could be confused with customer replies.
- Failed messages vanish.
- Reply box is enabled when it should not be.

---

## 17. Final Verdict Rules

### Approve

Use only when:

- user goal is clear
- hierarchy is strong
- states are complete
- copy is specific
- mobile is usable
- accessibility is acceptable
- component structure is maintainable

### Revise

Use when:

- UI is mostly usable but has weak copy, missing states, or hierarchy issues

### Redesign

Use when:

- layout is attractive but flow is wrong
- dashboard does not support decisions
- landing page has unclear positioning
- information architecture is broken

### Block

Use when:

- UI enables dangerous action without clarity
- user can mis-send, mis-approve, or misunderstand critical state
- accessibility is severely broken
- frontend code is not maintainable
- only happy path exists for a critical workflow

---

## 18. Brutal Audit Mindset

Do not ask:

```text
Does it look good?
```

Ask:

```text
Can the user understand it in 5 seconds?
Is the next action obvious?
What happens when data is empty?
What happens when API fails?
What happens on mobile?
Can keyboard users operate it?
Does every card help a decision?
Is the copy specific or generic?
Can this component survive real data?
Would this still work after 10 more features?
```

If not, it is not “clean”. It is unfinished.
