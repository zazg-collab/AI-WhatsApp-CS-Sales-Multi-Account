# Pending UI/UX Implementation

Daftar semua backend API yang sudah diimplementasi tapi belum ada frontend UI/nya.
Untuk setiap fitur, sertakan: endpoint, DTO, lokasi backend, dan deskripsi UI yang dibutuhkan.

---

## 1. Kirim Pesan

### 1.1 Send Poll

**Endpoint:** `POST /conversations/:id/poll`

**Request Body:**
```json
{
  "question": "Produk mana yang kamu suka?",
  "options": ["Produk A", "Produk B", "Produk C"],
  "selectableCount": 1
}
```

**DTO:** `apps/api/src/modules/conversations/dto/send-poll.dto.ts`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendPoll()`

**UI yang dibutuhkan:**
- Tombol "Poll" di area input pesan (sebelah tombol attachment)
- Modal/form: input pertanyaan, dynamic list options (min 2), toggle selectable count (1 atau multi)
- Tampilan pesan poll di chat bubble (question + options list)

---

### 1.2 Send Location

**Endpoint:** `POST /conversations/:id/location`

**Request Body:**
```json
{
  "latitude": -6.2088,
  "longitude": 106.8456,
  "name": "Kantor Pusat"
}
```

**DTO:** `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` → `SendLocationDto`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendLocation()`

**UI yang dibutuhkan:**
- Tombol "Lokasi" di area input pesan
- Peta sederhana (Leaflet/Google Maps) untuk picking lokasi
- Input nama lokasi (opsional)
- Tampilan pesan lokasi di chat bubble (pin + nama + koordinat)

---

### 1.3 Send Contact/vCard

**Endpoint:** `POST /conversations/:id/contact`

**Request Body:**
```json
{
  "contacts": [
    { "name": "Budi Santoso", "phone": "6281234567890" },
    { "name": "Sari Dewi", "phone": "6289876543210" }
  ]
}
```

**DTO:** `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` → `SendContactDto`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendContact()`

**UI yang dibutuhkan:**
- Tombol "Kontak" di area input pesan
- Form: dynamic list fields (nama + nomor HP), tombol tambah/hapus kontak
- Tampilan pesan kontak di chat bubble (nama kontak)

---

### 1.4 Send Sticker

**Endpoint:** `POST /conversations/:id/sticker`

**Request:** `multipart/form-data` (field: `file` — WebP image)

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendSticker()`

**UI yang dibutuhkan:**
- Tombol "Stiker" di area input pesan
- Upload file WebP
- Tampilan stiker di chat bubble

---

### 1.5 Send View-Once Media

**Endpoint:** `POST /conversations/:id/view-once`

**Request Body:**
```json
{
  "mediaType": "image",
  "url": "https://example.com/photo.jpg",
  "caption": "Bukti pembayaran"
}
```

**DTO:** `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` → `SendViewOnceDto`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendViewOnce()`

**UI yang dibutuhkan:**
- Toggle "View Once" di modal media (saat kirim gambar/video)
- Label "View Once" pada bubble pesan terkirim
- Ikon sekali lihat pada pesan diterima

---

### 1.6 Send Live Location

**Endpoint:** `POST /conversations/:id/live-location`

**Request Body:**
```json
{
  "latitude": -6.2088,
  "longitude": 106.8456,
  "durationSec": 600
}
```

**DTO:** `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` → `LiveLocationDto`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `sendLiveLocation()`

**UI yang dibutuhkan:**
- Opsi "Live Location" di menu kirim lokasi
- Input durasi (default 10 menit)
- Indikator "Live" pada bubble pesan

---

### 1.7 Forward Message

**Endpoint:** `POST /conversations/:id/messages/:messageId/forward`

**Request Body:**
```json
{
  "toPhone": "6281234567890"
}
```

**DTO:** `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` → `ForwardMessageDto`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `forwardMessage()`

**UI yang dibutuhkan:**
- Tombol "Forward" pada hover/context menu pesan
- Modal: input nomor tujuan atau pilih dari daftar percakapan
- Label "[Diteruskan]" pada bubble pesan

---

## 2. Manajemen Chat

### 2.1 Archive/Unarchive Chat

**Endpoint:**
- `POST /conversations/:id/archive`
- `POST /conversations/:id/unarchive`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `archiveChat()`

**UI yang dibutuhkan:**
- Tombol "Archive" di context menu percakapan (klik kanan / long press)
- Filter "Archived" di panel kiri
- Badge "Archived" pada percakapan terarsip
- Tombol "Unarchive" saat membuka percakapan terarsip

---

### 2.2 Pin/Unpin Chat

**Endpoint:**
- `POST /conversations/:id/pin`
- `POST /conversations/:id/unpin`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `pinChat()`

**UI yang dibutuhkan:**
- Tombol "Pin" di context menu percakapan
- Ikon pin pada percakapan yang dipinned
- Percakapan pinned selalu di atas daftar
- Tombol "Unpin" untuk melepas

---

### 2.3 Mute/Unmute Chat

**Endpoint:**
- `POST /conversations/:id/mute`
- `POST /conversations/:id/unmute`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `muteChat()`

**UI yang dibutuhkan:**
- Tombol "Mute" di context menu percakapan
- Ikon mute (speaker off) pada percakapan yang di-mute
- Tombol "Unmute" untuk melepas

---

### 2.4 Disappearing Messages

**Endpoint:** `POST /conversations/:id/disappearing`

**Request Body:**
```json
{
  "enable": true,
  "duration": 86400
}
```

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `setDisappearingMessages()`

**UI yang dibutuhkan:**
- Toggle "Disappearing Messages" di panel kanan (customer info)
- Pilihan durasi: 24 jam, 7 hari, 90 hari
- Ikon jam pada percakapan yang aktif

---

### 2.5 Mark Chat Unread

**Endpoint:** `POST /conversations/:id/unread`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `markChatUnread()`

**UI yang dibutuhkan:**
- Tombol "Mark Unread" di context menu percakapan
- Badge biru pada percakapan yang ditandai belum dibaca

---

### 2.6 Delete Chat (WhatsApp-side)

**Endpoint:** `DELETE /conversations/:id/wa-chat`

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `deleteChat()`

**UI yang dibutuhkan:**
- Tombol "Hapus Chat WA" di context menu percakapan
- Konfirmasi dialog: "Hapus chat dari WhatsApp? Data di dashboard tetap tersimpan."

---

## 3. Profil WhatsApp

### 3.1 Update Profile Name/Status

**Endpoint:** `PATCH /wa/accounts/:id/profile`

**Request Body:**
```json
{
  "name": "Toko Online ABC",
  "status": "Buka setiap hari 09:00-17:00"
}
```

**DTO:** `apps/api/src/modules/wa/dto/profile.dto.ts` → `UpdateProfileDto`

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `updateProfileName()`, `updateProfileStatus()`

**UI yang dibutuhkan:**
- Section "WhatsApp Profile" di halaman Accounts
- Input nama tampilan
- Input status "About"
- Tombol "Simpan"

---

### 3.2 Update Profile Picture

**Endpoint:** `PATCH /wa/accounts/:id/profile/picture`

**Request:** `multipart/form-data` (field: `file` — image)

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `updateProfilePicture()`

**UI yang dibutuhkan:**
- Avatar upload di section "WhatsApp Profile"
- Preview foto saat ini
- Crop image sederhana

---

### 3.3 Post Status/Story

**Endpoint:** `POST /wa/accounts/:id/status`

**Request Body:**
```json
{
  "text": "Promo minggu ini! Diskon 50%",
  "imageUrl": "https://example.com/promo.jpg",
  "caption": "Promo terbatas"
}
```

**DTO:** `apps/api/src/modules/wa/dto/profile.dto.ts` → `SendStatusDto`

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `sendStatus()`

**UI yang dibutuhkan:**
- Tombol "Status" di halaman Accounts
- Form: input text, upload/URL gambar, caption
- Preview sebelum post
- Riwayat status yang sudah diposting

---

## 4. Pencarian

### 4.1 Cross-Account Message Search

**Endpoint:** `GET /wa/accounts/:id/messages/search?q=kata&limit=50`

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `searchAllMessages()`

**UI yang dibutuhkan:**
- Search bar global di header dashboard
- Hasil search menampilkan: pesan, nama customer, nama akun, timestamp
- Klik hasil → navigasi ke percakapan + scroll ke pesan

---

### 4.2 Validate WhatsApp Number

**Endpoint:** `POST /conversations/validate-number`

**Request Body:**
```json
{
  "accountId": "uuid",
  "phoneNumber": "6281234567890"
}
```

**Response:**
```json
{
  "phoneNumber": "6281234567890",
  "exists": true
}
```

**Backend:** `apps/api/src/modules/conversations/conversations.service.ts` → `validateNumber()`

**UI yang dibutuhkan:**
- Validasi otomatis di modal "New Chat" saat input nomor
- Indikator hijau (aktif) / merah (tidak aktif) di samping nomor
- Pesan error jika nomor tidak terdaftar di WhatsApp

---

## 5. Manajemen Akun

### 5.1 Restart Session

**Endpoint:** `POST /wa/accounts/:id/restart`

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `restart()`

**UI yang dibutuhkan:**
- Tombol "Restart" di halaman Accounts (sebelah status)
- Loading spinner saat restart berlangsung
- Notifikasi berhasil/gagal

---

### 5.2 Account Health Details

**Endpoint:** `GET /wa/accounts/:id/health`

**Response:**
```json
{
  "accountId": "uuid",
  "dbStatus": "connected",
  "liveSocket": true,
  "reconnectAttempts": 0
}
```

**Backend:** `apps/api/src/modules/wa/wa.service.ts` → `getHealth()`

**UI yang dibutuhkan:**
- Expandable "Health" section di halaman Accounts
- Status: Live Socket (hijau/merah), Reconnect Attempts, DB Status
- Auto-refresh setiap 30 detik

---

## 6. Context Menu Percakapan

Semua aksi percakapan (archive, pin, mute, mark unread, delete, forward) sebaiknya digabung dalam satu context menu yang muncul saat klik kanan / long press pada percakapan di panel kiri.

**Struktur menu:**
```
📌 Pin / Unpin
📦 Archive / Unarchive
🔇 Mute / Unmute
🔵 Mark Unread
🗑️ Delete Chat (WA)
↪️ Forward (dari dalam chat)
```

---

## 7. Area Input Pesan (Extended)

Tombol-tombol baru di area input percakapan:

```
[📎] [📍] [👤] [📊] [🏷️] [▶️]
 │    │    │    │    │    └── View Once (image/video)
 │    │    │    │    └── Sticker
 │    │    │    └── Poll
 │    │    └── Contact
 │    └── Location
 └── Attachment (existing: media upload/URL)
```

---

## Referensi File

| File | Fungsi |
|------|--------|
| `apps/api/src/modules/conversations/conversations.controller.ts` | Semua endpoint percakapan |
| `apps/api/src/modules/conversations/conversations.service.ts` | Logic bisnis percakapan |
| `apps/api/src/modules/conversations/dto/wa-actions.dto.ts` | DTO untuk fitur baru |
| `apps/api/src/modules/conversations/dto/send-poll.dto.ts` | DTO untuk poll |
| `apps/api/src/modules/wa/wa.controller.ts` | Endpoint akun WA |
| `apps/api/src/modules/wa/wa.service.ts` | Logic bisnis Baileys |
| `apps/api/src/modules/wa/dto/profile.dto.ts` | DTO untuk profil |
| `apps/web/src/app/dashboard/page.tsx` | UI utama dashboard |
| `apps/web/src/app/accounts/page.tsx` | UI manajemen akun |
