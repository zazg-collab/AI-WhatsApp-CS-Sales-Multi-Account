'use client';

import { useState } from 'react';
import { api, getToken } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Ubah kata sandi', en: 'Change password' },
  desc: { id: 'Perbarui kata sandi akun Anda sendiri.', en: 'Update your own account password.' },
  oldLabel: { id: 'Kata sandi lama', en: 'Current password' },
  newLabel: { id: 'Kata sandi baru', en: 'New password' },
  confirmLabel: { id: 'Konfirmasi kata sandi baru', en: 'Confirm new password' },
  hint: { id: 'Minimal 8 karakter.', en: 'At least 8 characters.' },
  cancel: { id: 'Batal', en: 'Cancel' },
  save: { id: 'Simpan', en: 'Save' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  success: { id: 'Kata sandi berhasil diubah.', en: 'Password changed successfully.' },
  errSession: { id: 'Sesi tidak valid. Masuk ulang.', en: 'Invalid session. Please sign in again.' },
  errMismatch: { id: 'Konfirmasi kata sandi tidak cocok.', en: 'Password confirmation does not match.' },
  errLength: { id: 'Kata sandi baru minimal 8 karakter.', en: 'New password must be at least 8 characters.' },
  errFail: { id: 'Gagal mengubah kata sandi.', en: 'Failed to change password.' },
};

function getUserIdFromToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1])).sub ?? null;
  } catch {
    return null;
  }
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const t = useT(dict);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const userId = getUserIdFromToken();
    if (!userId) { setError(t('errSession')); return; }
    if (newPassword.length < 8) { setError(t('errLength')); return; }
    if (newPassword !== confirm) { setError(t('errMismatch')); return; }
    setSaving(true);
    try {
      await api(`/users/${userId}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errFail'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('title')}
      description={t('desc')}
      footer={
        success ? (
          <Button onClick={onClose}>{t('cancel')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" form="change-password-form" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        )
      }
    >
      {success ? (
        <p className="rounded border border-success-200 bg-success-50 px-3 py-2 text-[13px] text-success-700 dark:border-success-700/40 dark:bg-success-700/10 dark:text-success-400">{t('success')}</p>
      ) : (
        <form id="change-password-form" onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">{error}</p>}
          <Field label={t('oldLabel')} type="password" required value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
          <Field label={t('newLabel')} type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint={t('hint')} autoComplete="new-password" />
          <Field label={t('confirmLabel')} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </form>
      )}
    </Modal>
  );
}
