'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ArrowsClockwise, Shield, UserPlus, type Icon } from '@/components/ui/core-essential-icons';
import type { ConvDetail } from '../inbox.types';

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * >>> ANGGA — panel ini dulu BUKAN riwayat.
 *
 * Isinya dikarang di browser dari keadaan percakapan SAAT INI:
 *
 *   if (conv.sentinelReviews[0]) push({ label: 'Sentinel ...', time: null })
 *   if (conv.takeoverStatus === 'admin_takeover') push({ ..., time: null })
 *
 * Perhatikan `time: null` — tidak ada waktunya, karena memang tidak ada
 * kejadian yang tercatat. Cuma empat baris yang mungkin muncul, tanpa urutan,
 * tanpa sejarah: ubah mode AI sepuluh kali, panel ini tidak mencatat satu pun.
 *
 * Padahal riwayat aslinya SUDAH ADA. `logAudit()` menulis ke tabel `audit_logs`
 * untuk takeover, return_to_ai, draft_approve, draft_block, sentinel_action,
 * dan belasan aksi lain — lengkap dengan siapa pelakunya dan kapan. Yang kurang
 * cuma satu: `GET /audit-logs` belum bisa disaring per `entityId`, padahal
 * kolomnya sudah lama terisi. Itu ditambahkan bersama perubahan ini.
 *
 * Sekarang panel membaca data itu apa adanya. Tidak ada lagi baris karangan.
 */

interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  user?: { name?: string | null; email?: string | null } | null;
}

/** Kata kerja yang enak dibaca admin, bukan nama aksi mentah dari database. */
const LABEL: Record<string, string> = {
  takeover: 'Admin took over',
  return_to_ai: 'Returned to AI',
  draft_approve: 'Draft approved',
  draft_block: 'Draft blocked',
  sentinel_action: 'Sentinel intervened',
  conversation_start: 'Conversation started',
  chat_clear: 'Chat cleared',
  message_send: 'Message sent',
  message_send_failed: 'Message failed to send',
  message_location_send: 'Location sent',
};

function iconFor(action: string): { icon: Icon; tone: string } {
  if (action === 'sentinel_action') return { icon: Shield, tone: 'text-review-600' };
  if (action === 'takeover' || action === 'return_to_ai') return { icon: UserPlus, tone: 'text-gray-500' };
  return { icon: ArrowsClockwise, tone: 'text-sentinel-600' };
}

interface AuditTrailProps {
  conversation: ConvDetail;
}

export function AuditTrail({ conversation }: AuditTrailProps) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [ditolak, setDitolak] = useState(false);
  const id = conversation.id;

  useEffect(() => {
    let batal = false;
    setRows(null);
    setDitolak(false);
    (async () => {
      try {
        const res = await api<{ data: AuditRow[] }>(
          `/audit-logs?entity=conversation&entityId=${encodeURIComponent(id)}&limit=15`,
        );
        if (!batal) setRows(res.data ?? []);
      } catch {
        // Endpoint ini khusus supervisor/owner. Peran di bawah itu wajar
        // ditolak — jangan tampilkan galat merah, cukup jelaskan sekali.
        if (!batal) { setRows([]); setDitolak(true); }
      }
    })();
    return () => { batal = true; };
  }, [id]);

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Audit trail
      </h3>
      {rows === null ? (
        <p className="text-[11px] text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          {ditolak ? 'Audit trail is visible to supervisors and owners.' : 'No recorded actions yet'}
        </p>
      ) : (
        <ol className="space-y-2 text-[11px]">
          {rows.map((r) => {
            const { icon: Ikon, tone } = iconFor(r.action);
            const siapa = r.user?.name || r.user?.email;
            return (
              <li key={r.id} className="flex gap-2">
                <Ikon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-gray-700 dark:text-gray-200">
                    {LABEL[r.action] ?? r.action.replace(/_/g, ' ')}
                    {siapa ? ` — ${siapa}` : ''}
                  </p>
                  <p className="text-gray-400">{clockTime(r.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
