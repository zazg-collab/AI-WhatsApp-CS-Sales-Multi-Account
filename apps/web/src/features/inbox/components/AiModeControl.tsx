'use client';

import { useHasRole } from '@/lib/use-has-role';
import type { ConvDetail } from '../inbox.types';

interface AiModeControlProps {
  conversation: ConvDetail;
  onSetMode?: (mode: string) => Promise<void>;
  loading?: boolean;
}

const aiModeLabel: Record<string, string> = {
  ai_on: 'AI ON',
  ai_off: 'AI OFF',
  ai_draft: 'AI Draft',
  ai_supervised: 'AI Supervised',
  ai_paused: 'AI Paused',
};

const aiModeDescription: Record<string, string> = {
  ai_on: 'Replies automatically',
  ai_off: 'Manual replies only',
  ai_draft: 'AI drafts, you approve',
  ai_supervised: 'Sentinel reviews first',
  // >>> ANGGA: dulu "Paused due to risk" — tidak memberi tahu cara keluarnya.
  ai_paused: 'Paused by Sentinel — pick another mode to resume',
};

export function AiModeControl({ conversation, onSetMode, loading = false }: AiModeControlProps) {
  const currentMode = conversation.aiMode;
  const paused = currentMode === 'ai_paused';

  /**
   * >>> ANGGA — jalan buntu yang diperbaiki.
   *
   * Dulu SELURUH radio dimatikan begitu Sentinel menjeda AI, dengan pesan
   * "Contact admin to resume" — padahal `PATCH /conversations/:id/ai-mode`
   * memang mengizinkan admin/supervisor/owner. Jadi UI memblokir persis orang
   * yang disuruh dihubungi. Pintu cadangannya ("Return to AI" di menu header)
   * pun tidak menolong: ia hanya muncul kalau `takeoverStatus ===
   * 'admin_takeover'`, sedangkan Sentinel menyetelnya ke `waiting_admin`, dan
   * tidak ada tombol "Takeover" di UI untuk membuatnya begitu.
   *
   * Dua pintu, dua-duanya terkunci: percakapan yang dijeda TIDAK BISA
   * dilanjutkan dari layar sama sekali — cuma lewat curl.
   *
   * Sekarang `ai_paused` punya TEMPATNYA SENDIRI di daftar radio (keputusan
   * Bossfren): jeda jadi keadaan yang terlihat, bukan layar mati. Ia hanya
   * muncul saat memang sedang dijeda dan sengaja TIDAK bisa dipilih manual —
   * menjeda AI itu keputusan Sentinel, bukan menu.
   */
  const { allowed: canSwitch, ready: roleReady } = useHasRole('admin');
  const modes = ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised'] as const;

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        AI Mode
      </h3>

      <div className="space-y-2">
        {modes.map((mode) => (
          <label key={mode} className="flex items-start gap-2">
            <input
              type="radio"
              name="ai-mode"
              value={mode}
              checked={currentMode === mode}
              onChange={() => onSetMode?.(mode)}
              // Dijeda + bukan admin → tetap terkunci. Dijeda + admin → boleh
              // memilih, karena itulah cara melanjutkannya.
              disabled={loading || (paused && !canSwitch)}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {aiModeLabel[mode]}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {aiModeDescription[mode]}
              </p>
            </div>
          </label>
        ))}

        {paused && (
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="ai-mode"
              value="ai_paused"
              checked
              readOnly
              disabled
              className="mt-1"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {aiModeLabel.ai_paused}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {aiModeDescription.ai_paused}
              </p>
            </div>
          </label>
        )}
      </div>

      {/* Pesan "hubungi admin" hanya untuk yang memang tidak berwenang. Ditahan
          sampai `roleReady` supaya tidak berkedip di render pertama. */}
      {paused && roleReady && !canSwitch && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900/30 dark:bg-red-900/20">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            AI is paused due to a detected risk. Contact admin to resume.
          </p>
        </div>
      )}
    </div>
  );
}
