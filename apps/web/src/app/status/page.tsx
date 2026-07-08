'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash, Image, Info } from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { api } from '@/lib/api';

const textareaClass =
  'w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber?: string | null;
}

function parseTargetPhones(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function StatusPage() {
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Text status modal
  const [textOpen, setTextOpen] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [textBg, setTextBg] = useState('#25D366');
  const [textTargets, setTextTargets] = useState('');
  const [textSending, setTextSending] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [textSuccess, setTextSuccess] = useState(false);

  // Image status modal
  const [imageOpen, setImageOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageCaption, setImageCaption] = useState('');
  const [imageTargets, setImageTargets] = useState('');
  const [imageSending, setImageSending] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete status modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMessageId, setDeleteMessageId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((data) => {
        const list = data ?? [];
        setAccounts(list);
        if (list.length) setAccountId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  // --- Text status ---
  function openTextModal() {
    setTextContent('');
    setTextBg('#25D366');
    setTextTargets('');
    setTextError(null);
    setTextSuccess(false);
    setTextOpen(true);
  }

  async function handleSendText() {
    if (!textContent.trim()) return;
    setTextSending(true);
    setTextError(null);
    try {
      await api(`/wa/accounts/${accountId}/status/text`, {
        method: 'POST',
        body: JSON.stringify({
          text: textContent.trim(),
          backgroundColor: textBg || undefined,
          targetPhones: parseTargetPhones(textTargets),
        }),
      });
      setTextSuccess(true);
      setTimeout(() => { setTextOpen(false); setTextSuccess(false); }, 1500);
    } catch (err: unknown) {
      setTextError(err instanceof Error ? err.message : 'Failed to send text status');
    } finally {
      setTextSending(false);
    }
  }

  // --- Image status ---
  function openImageModal() {
    setImageFile(null);
    setImageCaption('');
    setImageTargets('');
    setImageError(null);
    setImageSuccess(false);
    setImageOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSendImage() {
    if (!imageFile) return;
    setImageSending(true);
    setImageError(null);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // strip data URL prefix, keep only base64 part
          resolve(result.split(',')[1] ?? result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(imageFile);
      });
      await api(`/wa/accounts/${accountId}/status/image`, {
        method: 'POST',
        body: JSON.stringify({
          imageBase64,
          caption: imageCaption.trim() || undefined,
          targetPhones: parseTargetPhones(imageTargets),
        }),
      });
      setImageSuccess(true);
      setTimeout(() => { setImageOpen(false); setImageSuccess(false); }, 1500);
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Failed to send image status');
    } finally {
      setImageSending(false);
    }
  }

  // --- Delete status ---
  function openDeleteModal() {
    setDeleteMessageId('');
    setDeleteError(null);
    setDeleteSuccess(false);
    setDeleteOpen(true);
  }

  async function handleDeleteStatus() {
    if (!deleteMessageId.trim()) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/wa/accounts/${accountId}/status/${encodeURIComponent(deleteMessageId.trim())}`, {
        method: 'DELETE',
      });
      setDeleteSuccess(true);
      setTimeout(() => { setDeleteOpen(false); setDeleteSuccess(false); }, 1500);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete status');
    } finally {
      setDeleting(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <AppLayout>
      <PageHeader
        title="Status / Stories"
        subtitle="Send text or image WhatsApp Stories to your contacts"
      />

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5 space-y-5">
        {/* Info notice */}
        <div className="flex items-start gap-3 rounded-lg border border-sentinel-200 bg-sentinel-50 px-4 py-3 text-sm text-sentinel-800 dark:border-sentinel-700/40 dark:bg-sentinel-900/20 dark:text-sentinel-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Status updates go to WhatsApp Stories. Target phones are optional — leave empty to
            broadcast to all contacts.
          </p>
        </div>

        {/* Account selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            WhatsApp Account
          </label>
          {loadingAccounts ? (
            <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ) : accounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No WhatsApp accounts found.{' '}
              <a href="/accounts" className="text-sentinel-600 underline dark:text-sentinel-400">
                Add one
              </a>
              .
            </p>
          ) : (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              aria-label="Select account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}{a.phoneNumber ? ` (${a.phoneNumber})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Action cards */}
        {accountId && (
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Text status */}
            <Card className="flex flex-col items-center gap-3 p-5 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sentinel-100 text-sentinel-700 dark:bg-sentinel-900/30 dark:text-sentinel-400">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  Text Status
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Post a text story with a background color
                </p>
              </div>
              <Button size="sm" onClick={openTextModal} disabled={!accountId}>
                Send Text
              </Button>
            </Card>

            {/* Image status */}
            <Card className="flex flex-col items-center gap-3 p-5 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-channel-100 text-channel-700 dark:bg-channel-900/30 dark:text-channel-400">
                <Image className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  Image Status
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Post an image story with optional caption
                </p>
              </div>
              <Button size="sm" onClick={openImageModal} disabled={!accountId}>
                Send Image
              </Button>
            </Card>

            {/* Delete status */}
            <Card className="flex flex-col items-center gap-3 p-5 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
                <Trash className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  Delete Status
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Remove a status by message ID
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400"
                onClick={openDeleteModal}
                disabled={!accountId}
              >
                Delete
              </Button>
            </Card>
          </div>
        )}

        {selectedAccount && (
          <p className="text-center text-xs text-gray-400">
            Acting on account: <span className="font-medium">{selectedAccount.accountName}</span>
            {selectedAccount.phoneNumber && ` — ${selectedAccount.phoneNumber}`}
          </p>
        )}
      </div>

      {/* Text status modal */}
      <Modal
        open={textOpen}
        onClose={() => setTextOpen(false)}
        title="Send Text Status"
        description="Post a text story to WhatsApp Stories."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTextOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={textSending || !textContent.trim()} onClick={handleSendText}>
              {textSending ? 'Sending…' : textSuccess ? 'Sent ✓' : 'Send'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {textError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {textError}
            </p>
          )}
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Text <span className="text-danger-500">*</span>
            </label>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Type your status update…"
              rows={4}
              className={textareaClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Background color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={textBg}
                onChange={(e) => setTextBg(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800"
              />
              <span className="font-mono text-xs text-gray-500">{textBg}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Target phones
              <span className="ml-1 text-[11px] font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={textTargets}
              onChange={(e) => setTextTargets(e.target.value)}
              placeholder="628123456789, 628987654321"
              rows={2}
              className={textareaClass}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Comma-separated. Leave empty to send to all contacts.
            </p>
          </div>
        </div>
      </Modal>

      {/* Image status modal */}
      <Modal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        title="Send Image Status"
        description="Post an image story to WhatsApp Stories."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setImageOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={imageSending || !imageFile} onClick={handleSendImage}>
              {imageSending ? 'Sending…' : imageSuccess ? 'Sent ✓' : 'Send'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {imageError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {imageError}
            </p>
          )}
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Image <span className="text-danger-500">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-sentinel-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-sentinel-700 hover:file:bg-sentinel-100 dark:text-gray-300 dark:file:bg-sentinel-900/30 dark:file:text-sentinel-300"
            />
            {imageFile && (
              <p className="mt-1 text-[11px] text-gray-500">Selected: {imageFile.name}</p>
            )}
          </div>
          <Field
            label="Caption"
            value={imageCaption}
            onChange={(e) => setImageCaption(e.target.value)}
            placeholder="Optional caption…"
          />
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Target phones
              <span className="ml-1 text-[11px] font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={imageTargets}
              onChange={(e) => setImageTargets(e.target.value)}
              placeholder="628123456789, 628987654321"
              rows={2}
              className={textareaClass}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Comma-separated. Leave empty to send to all contacts.
            </p>
          </div>
        </div>
      </Modal>

      {/* Delete status modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Status"
        description="Remove a WhatsApp status by its message ID."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-danger-600 hover:bg-danger-700"
              disabled={deleting || !deleteMessageId.trim()}
              onClick={handleDeleteStatus}
            >
              {deleting ? 'Deleting…' : deleteSuccess ? 'Deleted ✓' : 'Delete'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {deleteError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {deleteError}
            </p>
          )}
          <Field
            label="Message ID"
            value={deleteMessageId}
            onChange={(e) => setDeleteMessageId(e.target.value)}
            placeholder="e.g. BAE5XXXXXXXXXXXX"
          />
          <p className="text-[11px] text-gray-400">
            The message ID of the status you want to remove.
          </p>
        </div>
      </Modal>
    </AppLayout>
  );
}
