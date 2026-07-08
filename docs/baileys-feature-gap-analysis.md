# Baileys Feature Gap Analysis

> Analisis fitur `@whiskeysockets/baileys` yang sudah dan belum diimplementasikan di Backend (Hermes API) dan Frontend (Next.js).
>
> **Sumber data:** Source code audit mendalam terhadap `apps/api/src/modules/wa/` (BE), `apps/web/src/` (FE), dan `waha-core/src/core/engines/noweb/` (referensi Baileys).
>
> **Update 2026-07-06:** Prioritas 1–6 (group management, buttons, list messages,
> pin, edit caption, link preview, channels, status/stories, webhooks) sudah
> diimplementasikan BE+FE sejak audit awal. Custom disappearing-message duration
> dan `markOnlineOnConnect: false` juga sudah ada. Bagian di bawah direvisi untuk
> mencerminkan itu — sisanya (label CRUD, group picture, invite preview, dll.)
> masih gap nyata.

---

## Legenda

| Label | Arti |
|:-----:|------|
| ✅ | Sudah diimplementasikan |
| ❌ | Belum diimplementasikan |
| 🟢 | Belum di BE + FE |
| 🟡 | Sudah di BE, belum di FE |
| 🔴 | Belum di BE (otomatis juga belum di FE) |

---

## Ringkasan

| Status | Jumlah Fitur | Arti |
|:------:|:------------:|------|
| 🟡 Sudah di BE, belum di FE | **1 fitur** (halaman label per-chat) | sisanya sudah dikerjakan sejak audit awal |
| 🟢 Belum di BE + FE | **~12 fitur** | Baileys bisa, tapi belum disentuh sama sekali |
| 🔴 Belum di BE | **~6 fitur** | Konfigurasi session/internal yang belum diadopsi |
| ✅ Sudah di BE + FE | **~140 fitur** | Berfungsi penuh |

---

## ✅ Selesai Sejak Audit Awal (dulu 🟡 "Sudah di BE, Belum di FE")

Semua fitur berikut sekarang **ada BE + FE**, terverifikasi lewat build (`next build`
sukses untuk semua route termasuk `/groups`, `/channels`, `/status`, `/webhooks`)
dan source read langsung:

| # | Fitur | FE |
|:-:|-------|:--:|
| 1 | Group management penuh (create/join/leave/invite/participants/settings/metadata) | `apps/web/src/app/groups/page.tsx` (701 baris) |
| 2 | Interactive reply buttons | `ChatComposer.tsx` |
| 3 | List messages (sections/title/buttonText) | `ChatComposer.tsx` |
| 4 | Pin/unpin message | `ChatComposer.tsx` |
| 5 | Edit media caption | `ChatComposer.tsx` |
| 6 | Custom link preview | `ChatComposer.tsx` |
| 7 | Add/edit WhatsApp contact | wired |
| 8 | Recording indicator start/stop | `ChatComposer.tsx` |
| 9 | Channels/Newsletters (list/create/metadata/delete/follow/mute/react) | `apps/web/src/app/channels/page.tsx` (331 baris) |
| 10 | Status/Stories (post text/image, delete) | `apps/web/src/app/status/page.tsx` (469 baris) |
| 11 | Labels — read/add/remove ke chat (bukan CRUD definisi, lihat di bawah) | ada di BE (`wa-ops.controller.ts`), belum ada halaman FE khusus |
| 12 | Disappearing messages custom duration | `DisappearingMessagesDto.duration` — sudah bisa custom, tidak lagi hardcode 7 hari |

Bonus di luar daftar awal: halaman `/webhooks` (195 baris) untuk kelola webhook endpoints.

### Sisa gap nyata dari kategori ini

| Fitur | Status |
|-------|--------|
| Label CRUD (create/update/delete definisi label, bukan cuma assign) | ❌ BE+FE |
| Halaman FE khusus untuk lihat/kelola label per chat | ❌ FE (endpoint BE sudah ada) |

---

## 🟢 Belum di BE + FE (Belum Tersentuh)

Fitur-fitur Baileys yang **belum diimplementasikan sama sekali**, baik di backend maupun frontend.

### 1. Label CRUD (Create/Update/Delete Label Definitions)

Backend hanya **cache** labels dari events `labels.edit`, tapi tidak bisa membuat, mengubah, atau menghapus definisi label.

| Fitur | Baileys API |
|-------|-------------|
| Create label | `sock.addLabel(undefined, { id, name, color })` |
| Update label | `sock.addLabel(undefined, { id, name, color })` |
| Delete label | `sock.addLabel(undefined, { id, deleted: true })` |

### 2. Get Chat Labels & Chats by Label

| Fitur | Baileys API |
|-------|-------------|
| Get labels for a specific chat | `store.getChatLabels(jid)` |
| Get chats by label ID | `store.getChatsByLabelId(labelId)` |

### 3. Group Profile Picture

| Fitur | Baileys API |
|-------|-------------|
| Set group profile picture | `sock.updateProfilePicture(groupId, buffer)` |
| Remove group profile picture | `sock.removeProfilePicture(groupId)` |

### 4. Get Group Invite Info (Preview Before Joining)

| Fitur | Baileys API |
|-------|-------------|
| Get group info from invite code | `sock.groupGetInviteInfo(code)` |

### 5. Channel Preview Messages

| Fitur | Baileys API |
|-------|-------------|
| Preview channel messages before following | `sock.newsletterFetchPreviewMessages('invite', code, limit)` |

### 6. Channel Update Picture

| Fitur | Baileys API |
|-------|-------------|
| Update newsletter profile picture | `sock.newsletterUpdatePicture(jid, picture)` |

### 7. Search Channels

| Fitur | Baileys API |
|-------|-------------|
| Search channels by view/text | `sock.executeWMexQuery(variables, queryId, path)` |

### 8. Voice & Video Status

| Fitur | Baileys API |
|-------|-------------|
| Post voice status | `sock.sendMessage('status@broadcast', { audio, ptt: true })` |
| Post video status | `sock.sendMessage('status@broadcast', { video })` |

### 9. GIF Playback & Video Notes (PTV)

| Fitur | Baileys API |
|-------|-------------|
| Send as GIF | `sock.sendMessage(jid, { video, gifPlayback: true })` |
| Send as video note | `sock.sendMessage(jid, { video, ptv: true })` |

### 10. URL / CALL / COPY Button Types

Backend hanya support **REPLY** button type.

| Fitur | Baileys API |
|-------|-------------|
| URL button | `buttonType: 'cta_url'` dengan `url` |
| Call button | `buttonType: 'cta_call'` dengan `phone_number` |
| Copy button | `buttonType: 'cta_copy'` dengan `copy_code` |

### 11. Poll Voting (Read Hasil Vote)

Backend emit event `poll:update` via Socket.IO, tapi tidak ada endpoint untuk membaca hasil agregasi vote.

| Fitur | Baileys API |
|-------|-------------|
| Decrypt poll vote | `decryptPollVote(vote, opts)` |
| Get aggregate votes | `getAggregateVotesInPollMessage({ message, pollUpdates })` |

### 12. Secret Message Edits (Mobile)

| Fitur | Baileys API |
|-------|-------------|
| Decrypt mobile-app secret edits | `decryptSecretEncryptedMessageEditProto(...)` |

---

## 🔴 Belum di BE (Session Configuration)

`markOnlineOnConnect: false` sudah diset (`wa.service.ts:138`) — dicoret dari daftar.
Sisanya masih belum diadopsi:

| Fitur | Baileys Config | Manfaat |
|-------|---------------|---------|
| Proxy support | `socketConfig.agent` + `fetchAgent` | Bypass regional block |
| Mobile API mode | `mobile: true` | Alternative auth (lebih stabil) |
| Custom browser profile pilihan | `Browsers.ubuntu()`, `Browsers.windows()` | Hanya pakai `appropriate()` |
| msgRetryCounterCache | `NodeCache` | Reliability pengiriman |
| placeholderResendCache | `NodeCache` | Reliability pengiriman |
| Custom query timeout | `defaultQueryTimeoutMs` | Optimalisasi timeout |

---

## ✅ Sudah di BE + FE (129+ Fitur Berfungsi)

### Session Management
- ✅ Create account via QR code scan
- ✅ Create account via pairing code (phone number)
- ✅ Auto-detect device name/phone on connect
- ✅ Edit account name and phone
- ✅ Delete account (with logout)
- ✅ Restart account session
- ✅ QR code display (with freshness timer 45s)
- ✅ Pairing code display (8-digit, copy button)
- ✅ Session status: connected/connecting/reconnecting/qr_required/disconnected/banned/paused
- ✅ Health check (live socket + reconnect attempts)
- ✅ Account list with search, filter, sort by status priority

### Text Messaging
- ✅ Send text messages (with typing simulation)
- ✅ Edit sent messages
- ✅ Delete/retract sent messages
- ✅ Reply to messages (quote preview)
- ✅ Forward messages (re-send from DB)
- ✅ Send with @mentions

### Media Messaging
- ✅ Send image (from URL or upload)
- ✅ Send video (from URL or upload)
- ✅ Send voice/audio (from URL or upload)
- ✅ Send document/file (from URL or upload)
- ✅ Send sticker
- ✅ Upload media via multipart FormData
- ✅ Media library (assets picker)

### Interactive Messaging
- ✅ Send location (lat/lng + name)
- ✅ Send poll (question + options)
- ✅ Send contact card (name + vCard)
- ✅ React to message (6 emoji: 👍❤️😂😮😢🙏)
- ✅ Star/unstar message

### Message Status / Delivery Tracking
- ✅ Pending (clock icon)
- ✅ Failed (warning icon)
- ✅ Sent (single check)
- ✅ Delivered (double check, gray)
- ✅ Read (double check, blue)

### Conversation Management
- ✅ List conversations with search + filters
- ✅ Start new conversation
- ✅ Validate phone number on WhatsApp
- ✅ Search synced WhatsApp contacts
- ✅ Mark as read
- ✅ Pin/unpin conversation
- ✅ Mute/unmute conversation
- ✅ Archive/unarchive conversation
- ✅ Block/unblock contact
- ✅ Disappearing messages (on/off)
- ✅ Assign conversation labels

### Profile Management
- ✅ Get profile (name, status, picture)
- ✅ Edit profile name and status
- ✅ Set profile picture
- ✅ Delete profile picture

### Presence
- ✅ Set online/offline
- ✅ Subscribe to contact presence
- ✅ Start/stop typing indicator
- ✅ Customer typing presence via Socket.IO

### Contact Book
- ✅ View synced WhatsApp contacts (paginated, searchable)
- ✅ Filter by account
- ✅ CRM linkage display
- ✅ LID (privacy number) handling

### Business Hours
- ✅ Enable/disable business hours
- ✅ Start/end time, days, timezone
- ✅ Away message

### AI / Auto-Reply Pipeline
- ✅ AI modes: off, on, draft, supervised
- ✅ AI draft approval/blocking/editing
- ✅ Admin takeover with return-to-AI
- ✅ Hermes AI review
- ✅ Bot/persona assignment + AI suggestion
- ✅ Workflow status (Open/Pending/Resolved)
- ✅ Admin assignment
- ✅ Escalation

### Inbound Processing
- ✅ Auto-away message (business hours)
- ✅ CSAT capture
- ✅ Auto opt-out detection
- ✅ Auto-takeover on phone reply
- ✅ Duplicate message dedup

### Real-time Events (Socket.IO)
- ✅ `wa:qr`, `wa:pairing-code`, `wa:status`, `wa:presence`
- ✅ `message:new`, `message:draft`, `message:draft-removed`
- ✅ `message:status`, `message:updated`, `message:edited`
- ✅ `message:deleted`, `message:reaction`
- ✅ `conversation:updated`, `conversation:sla-breach/cleared`
- ✅ `hermes:alert`, `customer:avatar`

### Other
- ✅ Rate limiting (20 sends/min per account)
- ✅ Human typing delay + send delay
- ✅ Auto-reconnect with exponential backoff
- ✅ Call auto-rejection
- ✅ Full history sync on first connect
- ✅ Contact sync with @lid resolution
- ✅ Auto-assignment (round-robin, least-busy)
- ✅ CSAT capture
- ✅ Auto opt-out detection
- ✅ Audit trail (AI, takeover, assignment)
- ✅ Follow-up scheduling
- ✅ i18n (Indonesian + English)
- ✅ Browser notifications + audio chime

---

## Prioritas Implementasi (revisi 2026-07-06)

Prioritas 1–6 dari versi audit awal (group management, buttons/list, status,
channels, pin/caption/link-preview) **sudah selesai**. Sisa kerja nyata:

### 🟡 Prioritas 1 — Halaman Label per-Chat
BE sudah bisa baca semua label + add/remove label ke chat (`GET/POST/DELETE
/wa/accounts/:id/labels...`). Belum ada UI khusus untuk browse label dan
assign ke percakapan dari dashboard.

### 🟢 Prioritas 2 — Label CRUD (definisi)
Baileys mendukung `sock.addLabel(...)` untuk create/update/delete definisi
label, belum diadopsi di BE sama sekali.

### 🟢 Prioritas 3 — Group Picture, Invite Preview, Channel Preview/Search
Fitur kecil yang belum disentuh BE+FE (lihat daftar 🟢 di atas).

### 🔴 Prioritas 4 — Session Reliability Config
`msgRetryCounterCache`, `placeholderResendCache`, `defaultQueryTimeoutMs` —
peningkatan reliability pengiriman pesan, tidak butuh UI baru, cukup ubah
`makeWASocket(...)` di `wa.service.ts`.

### 🟢 Prioritas 5 — Proxy & Mobile API Mode
Nice-to-have untuk bypass regional block / auth alternatif; tidak mendesak
untuk MVP single-tenant.

---

## Lampiran: 31 Endpoint BE (Referensi Historis — Sebagian Besar Sudah Ada FE-nya)

| # | Method | Endpoint | Kategori |
|:-:|:------:|----------|:--------:|
| 1 | POST | `/wa/accounts/:id/groups` | Group |
| 2 | POST | `/wa/accounts/:id/groups/join` | Group |
| 3 | GET | `/wa/accounts/:id/groups` | Group |
| 4 | GET | `/wa/accounts/:id/groups/:gId/invite-code` | Group |
| 5 | POST | `/wa/accounts/:id/groups/:gId/revoke-invite` | Group |
| 6 | POST | `/wa/accounts/:id/groups/:gId/leave` | Group |
| 7 | POST | `/wa/accounts/:id/groups/:gId/participants` | Group |
| 8 | PUT | `/wa/accounts/:id/groups/:gId` | Group |
| 9 | PUT | `/wa/accounts/:id/groups/:gId/settings` | Group |
| 10 | GET | `/wa/accounts/:id/groups/:gId/metadata` | Group |
| 11 | POST | `/wa/accounts/:id/messages/buttons` | Buttons |
| 12 | POST | `/wa/accounts/:id/messages/list` | List |
| 13 | POST | `/wa/accounts/:id/messages/pin` | Pin |
| 14 | PUT | `/wa/accounts/:id/messages/caption` | Caption |
| 15 | POST | `/wa/accounts/:id/messages/link-preview` | Link |
| 16 | POST | `/wa/accounts/:id/contacts` | Contact |
| 17 | POST | `/wa/accounts/:id/chats/:phone/recording/start` | Recording |
| 18 | POST | `/wa/accounts/:id/chats/:phone/recording/stop` | Recording |
| 19 | GET | `/wa/accounts/:id/labels` | Labels |
| 20 | POST | `/wa/accounts/:id/chats/:phone/labels/:lId` | Labels |
| 21 | DELETE | `/wa/accounts/:id/chats/:phone/labels/:lId` | Labels |
| 22 | GET | `/wa/accounts/:id/channels` | Channel |
| 23 | POST | `/wa/accounts/:id/channels` | Channel |
| 24 | GET | `/wa/accounts/:id/channels/:cId` | Channel |
| 25 | DELETE | `/wa/accounts/:id/channels/:cId` | Channel |
| 26 | POST | `/wa/accounts/:id/channels/:cId/follow` | Channel |
| 27 | POST | `/wa/accounts/:id/channels/:cId/mute` | Channel |
| 28 | POST | `/wa/accounts/:id/channels/:cId/:sId/react` | Channel |
| 29 | POST | `/wa/accounts/:id/status/text` | Status |
| 30 | POST | `/wa/accounts/:id/status/image` | Status |
| 31 | DELETE | `/wa/accounts/:id/status/:mId` | Status |
