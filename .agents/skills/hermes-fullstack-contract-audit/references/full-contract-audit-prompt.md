# Full Prompt: Hermes Backend/UI Contract And AI No-Slop Audit

Use this prompt when asking an agent to audit whether Hermes frontend features are really backed by backend implementation.

```text
Kamu adalah Principal Fullstack Architect, Backend Auditor, Enterprise UX Auditor, dan AI Safety Reviewer.

Tugasmu: audit aplikasi Hermes AI Sales & Customer Service Control Center agar tidak ada AI slop fullstack. Fokus utama: pastikan setiap fitur yang tampil di frontend benar-benar punya backend/API/service/database yang bekerja, bukan stub, mock, fake data, placeholder, 501, TODO, atau UI palsu.

Jangan hanya menilai apakah UI terlihat lengkap atau backend punya file controller. Nilai kontrak lengkap:

UI route/component -> API client call -> backend route/controller -> DTO validation -> service/use-case -> database/external provider/job -> response shape -> UI states -> tests/verification

Kalau salah satu rantai hilang, beri status:
- implemented
- partial
- frontend-only
- backend-stub
- contract-mismatch
- unsafe
- unknown

Konteks produk:
- Multi-account WhatsApp dashboard berbasis Baileys.
- Chat UI untuk CS/sales.
- AI draft, AI_ON, AI_SUPERVISED, AI_PAUSED, human takeover.
- Hermes supervisor untuk review risiko, confidence, alerts, daily reports, bot performance, knowledge gaps, ask, bot insight.
- Customer CRM, notes, timeline, bulk actions.
- Campaign controlled sending: draft, preview, approval, queue, rate limit, opt-out, duplicate guard, idempotency.
- Monitoring: response time, AI quality/fallback, campaign delivery, account health.
- Admin users, roles, audit logs, CSV exports, knowledge base, bot/persona editor.

Audit wajib dilakukan ke:
- apps/web routes/pages/components.
- apps/web API client, hooks, socket listeners, forms, tables, charts, settings, dropdowns.
- apps/api controllers, services, DTOs, guards, queues, gateways, notification paths.
- packages/database Prisma schema and migrations.
- tests, QA scripts, OpenAPI/docs if available.

Cari eksplisit dengan rg:
- 501
- NotImplemented
- not implemented
- TODO
- FIXME
- stub
- mock
- fake
- placeholder
- coming soon
- return []
- return null
- Promise.resolve
- setTimeout
- sample
- dummy
- hardcoded
- mockData
- sampleData
- fakeApi
- demo
- TODO API

Audit semua fitur berikut:
1. Login/auth/roles.
2. Dashboard.
3. Inbox/chat/manual reply.
4. Message send/media send/failed send retry.
5. AI modes: on/off/draft/supervised/paused.
6. Human takeover/return-to-AI.
7. Conversation search/status/unread/waiting/socket updates.
8. WhatsApp/Baileys accounts: QR, connect, reconnect, session health, disconnected, logged out, banned, rate limited, throttled, queue.
9. Customers CRM, notes, stage, tags, assigned admin, bulk action, opt-in/out.
10. Campaigns: draft, recipient preview, exclusions, approval, queue, scheduled start, duplicate, monitoring, delivery, opt-out.
11. Hermes: review, alerts, daily reports, bot performance, knowledge gaps, snapshot, ask, bot insight.
12. Knowledge base CRUD and active/expired prompt injection.
13. Bot/persona editor and prompt behavior.
14. Monitoring analytics.
15. Admin users/password/roles.
16. Audit logs.
17. CSV exports.
18. Settings/configuration surfaces.

Untuk setiap fitur, isi matriks:

Feature:
Frontend location:
User action:
API client call:
Backend endpoint:
Controller/service:
DTO/validation:
Auth/role guard:
Database/external side effect:
Realtime/socket event:
Error states exposed to UI:
Tests/verification:
Status:
Fix:

Backend completeness checklist:
- endpoint path/method cocok dengan frontend.
- request body cocok dengan DTO.
- enum/status cocok frontend dan backend.
- validasi input lengkap.
- role guard dan object-level access ada.
- service melakukan aksi nyata.
- database persistence nyata.
- external provider/queue punya timeout/retry/failure handling.
- send/campaign action punya idempotency.
- audit log ada untuk aksi penting.
- response shape cocok dengan asumsi frontend.
- error state bisa ditampilkan UI.
- tests/QA ada untuk critical flow.

UI honesty checklist:
- Jika backend belum ada, UI tidak boleh terlihat bekerja.
- Jangan fake success toast.
- Jangan kontrol settings yang tidak dipersist.
- Jangan chart dengan angka palsu.
- Jangan tombol approve/send/retry yang hanya mengubah local state.
- Jika endpoint partial, tampilkan subset yang benar-benar bekerja.
- Jika user tidak punya permission, tampilkan disabled/permission-denied dengan alasan.
- Jika backend error, tampilkan recovery path.

AI/Hermes no-slop checklist:
- AI prompt memakai data DB nyata, knowledge aktif, chat history, customer memory.
- Knowledge expired/inactive tidak masuk prompt.
- AI fallback phrase dipakai saat knowledge tidak cukup.
- Hermes review decision mengubah behavior nyata, bukan hanya display.
- Supervised mode benar-benar pre-send gate.
- AI_ON post-send audit tertaut ke message.
- Takeover/paused AI benar-benar memblokir auto-reply.
- Provider error menghasilkan state aman.
- Config endpoint tidak membocorkan secret.
- Prompt injection dari customer tidak bisa override system/business rules.

Baileys/WhatsApp contract checklist:
- QR UI didukung endpoint/event QR nyata.
- QR expired/reconnect/disconnected/banned/logged-out punya backend state.
- Health endpoint benar-benar membaca session/session map/connection state.
- Failed send tersimpan dan bisa retry jika UI menampilkan retry.
- Typing delay/throttle/rate limit diterapkan backend, bukan cuma teks UI.
- Campaign sending memakai queue/rate limit/idempotency.
- Socket events cocok dengan listener frontend.

Analytics/settings checklist:
- Analytics dihitung dari DB/backend, bukan fake frontend.
- Date range/status/account/bot/campaign filters tervalidasi backend.
- Settings control dipersist atau read-only.
- AI provider settings tidak expose API key.
- WhatsApp gateway settings sesuai kemampuan backend.
- Campaign safety settings sesuai enforcement backend.

Output wajib:

Hermes Fullstack Contract / AI No-Slop Audit

Overall Verdict: approve / revise / block / not-production-ready
Overall Contract Risk: Low / Medium / High / Critical

Executive Summary:
- ...

P0 Contract Breaks:
1. ...

P1 Backend/UI Mismatches:
1. ...

Stub / Fake / Placeholder Findings:
- ...

Feature Contract Matrix:
- Feature:
  Frontend:
  Backend:
  Persistence:
  Auth/Role:
  UI states:
  Status:
  Fix:

Backend Completeness:
- ...

Frontend Honesty / UI Alignment:
- ...

AI/Hermes No-Slop Findings:
- ...

Baileys/WhatsApp Contract Findings:
- ...

Analytics Contract Findings:
- ...

Settings Contract Findings:
- ...

Tests / Verification Gaps:
- ...

Implementation Plan:
1. P0:
2. P1:
3. P2:

Final Verdict:

Verdict rules:
- approve: semua critical frontend feature punya backend nyata, validasi, auth, persistence, error states, dan verification.
- revise: ada mismatch/partial non-critical tapi core flows aman.
- block: UI memungkinkan user percaya fitur risky bekerja padahal backend stub/missing/unsafe.
- not-production-ready: banyak fitur hanya UI, tests minim, atau critical flows belum terverifikasi.
```
