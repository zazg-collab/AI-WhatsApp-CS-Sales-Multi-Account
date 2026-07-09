'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash, Radio, Eye } from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sentinel-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

interface Channel {
  id?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export default function ChannelsPage() {
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  // Create channel modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Metadata modal
  const [metaChannel, setMetaChannel] = useState<Channel | null>(null);
  const [metaData, setMetaData] = useState<unknown>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  // Delete confirmation
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);

  // Follow / mute in-flight
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);

  // Subscriber counts — Baileys has no bulk field for this, fetched per channel.
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});

  // Post-to-channel modal
  const [postChannelId, setPostChannelId] = useState<string | null>(null);
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((data) => {
        const list = data ?? [];
        setAccounts(list);
        if (list.length > 0) setSelectedAccountId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    setChannels([]);
    setChannelsError(null);
    setSubscriberCounts({});
    setLoadingChannels(true);
    api<Channel[]>(`/wa/accounts/${selectedAccountId}/channels`)
      .then((data) => {
        const list = data ?? [];
        setChannels(list);
        for (const c of list) {
          const id = c.id as string | undefined;
          if (!id) continue;
          api<{ subscribers: number }>(`/wa/accounts/${selectedAccountId}/channels/${id}/subscribers`)
            .then((r) => setSubscriberCounts((prev) => ({ ...prev, [id]: r.subscribers })))
            .catch(() => {});
        }
      })
      .catch((err: Error) => setChannelsError(err.message ?? 'Failed to load channels'))
      .finally(() => setLoadingChannels(false));
  }, [selectedAccountId]);

  async function handlePostToChannel() {
    if (!postChannelId || !postText.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      await api(`/wa/accounts/${selectedAccountId}/channels/${postChannelId}/post`, {
        method: 'POST',
        body: JSON.stringify({ text: postText.trim() }),
      });
      setPostChannelId(null);
      setPostText('');
    } catch (err: unknown) {
      setPostError((err as Error).message ?? 'Failed to post to channel');
    } finally {
      setPosting(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api(`/wa/accounts/${selectedAccountId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || undefined }),
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateDescription('');
      // Refresh
      const data = await api<Channel[]>(`/wa/accounts/${selectedAccountId}/channels`);
      setChannels(data ?? []);
    } catch (err: unknown) {
      setCreateError((err as Error).message ?? 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(channelId: string) {
    if (!confirm('Delete this channel? This cannot be undone.')) return;
    setDeletingChannelId(channelId);
    try {
      await api(`/wa/accounts/${selectedAccountId}/channels/${channelId}`, { method: 'DELETE' });
      setChannels((prev) => prev.filter((c) => (c.id ?? '') !== channelId));
    } catch (err: unknown) {
      setToast({ message: (err as Error).message ?? 'Failed to delete channel', tone: 'danger' });
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function handleFollow(channelId: string, follow: boolean) {
    setActionInFlight(`follow:${channelId}`);
    try {
      await api(`/wa/accounts/${selectedAccountId}/channels/${channelId}/follow`, {
        method: 'POST',
        body: JSON.stringify({ follow }),
      });
    } catch (err: unknown) {
      setToast({ message: (err as Error).message ?? 'Action failed', tone: 'danger' });
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleMute(channelId: string, mute: boolean) {
    setActionInFlight(`mute:${channelId}`);
    try {
      await api(`/wa/accounts/${selectedAccountId}/channels/${channelId}/mute`, {
        method: 'POST',
        body: JSON.stringify({ mute }),
      });
    } catch (err: unknown) {
      setToast({ message: (err as Error).message ?? 'Action failed', tone: 'danger' });
    } finally {
      setActionInFlight(null);
    }
  }

  async function openMetadata(channel: Channel) {
    const channelId = channel.id ?? '';
    setMetaChannel(channel);
    setMetaData(null);
    setMetaLoading(true);
    try {
      const data = await api(`/wa/accounts/${selectedAccountId}/channels/${channelId}`);
      setMetaData(data);
    } catch {
      setMetaData({ error: 'Failed to load metadata' });
    } finally {
      setMetaLoading(false);
    }
  }

  const channelName = (c: Channel) => (c.name as string | undefined) ?? (c.id as string | undefined) ?? 'Unnamed Channel';
  const followerCount = (c: Channel) => {
    const id = c.id as string | undefined;
    return id && id in subscriberCounts ? subscriberCounts[id] : null;
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        {toast && (
          <div className="fixed right-6 top-6 z-50 w-80">
            <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <PageHeader title="Channels" subtitle="Manage WhatsApp Newsletters & Channels" />
          {selectedAccountId && (
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus size={16} />
              New Channel
            </Button>
          )}
        </div>

        {/* Account selector */}
        {loadingAccounts ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No WhatsApp accounts found.</p>
        ) : (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Account</label>
            <select
              className={inputClass + ' max-w-xs'}
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.phoneNumber})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Channel list */}
        {selectedAccountId && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">My Channels</h2>
            {loadingChannels ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            ) : channelsError ? (
              <p className="text-sm text-red-500">{channelsError}</p>
            ) : channels.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No channels found for this account.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {channels.map((channel, idx) => {
                  const id = (channel.id as string | undefined) ?? String(idx);
                  const count = followerCount(channel);
                  return (
                    <Card key={id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Radio size={18} className="shrink-0 text-sentinel-500" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900 dark:text-gray-100">{channelName(channel)}</p>
                            {count !== null && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{count.toLocaleString()} followers</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            title="View metadata"
                            className="rounded p-1 text-gray-400 hover:text-sentinel-500 dark:hover:text-sentinel-400"
                            onClick={() => openMetadata(channel)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            title="Delete channel"
                            className="rounded p-1 text-gray-400 hover:text-red-500"
                            disabled={deletingChannelId === id}
                            onClick={() => handleDelete(id)}
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </div>

                      <button
                        className="rounded-lg bg-sentinel-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sentinel-700"
                        onClick={() => { setPostChannelId(id); setPostText(''); setPostError(null); }}
                      >
                        Post to channel
                      </button>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-sentinel-50 hover:border-sentinel-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
                          disabled={actionInFlight === `follow:${id}`}
                          onClick={() => handleFollow(id, true)}
                        >
                          Follow
                        </button>
                        <button
                          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
                          disabled={actionInFlight === `follow:${id}`}
                          onClick={() => handleFollow(id, false)}
                        >
                          Unfollow
                        </button>
                        <button
                          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-yellow-50 hover:border-yellow-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
                          disabled={actionInFlight === `mute:${id}`}
                          onClick={() => handleMute(id, true)}
                        >
                          Mute
                        </button>
                        <button
                          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
                          disabled={actionInFlight === `mute:${id}`}
                          onClick={() => handleMute(id, false)}
                        >
                          Unmute
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Create channel modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Channel">
        <div className="flex flex-col gap-4">
          <Field label="Channel name">
            <input
              className={inputClass}
              placeholder="My Channel"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              className={inputClass}
              rows={3}
              placeholder="What is this channel about?"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </Field>
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Metadata modal */}
      <Modal open={!!metaChannel} onClose={() => setMetaChannel(null)} title={`Channel: ${metaChannel ? channelName(metaChannel) : ''}`}>
        {metaLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading metadata...</p>
        ) : (
          <pre className="overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200 max-h-80">
            {JSON.stringify(metaData, null, 2)}
          </pre>
        )}
      </Modal>

      {/* Post to channel modal */}
      <Modal open={!!postChannelId} onClose={() => setPostChannelId(null)} title="Post to channel">
        <div className="flex flex-col gap-4">
          <Field label="Message">
            <textarea
              className={inputClass}
              rows={4}
              placeholder="What's new?"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
            />
          </Field>
          {postError && <p className="text-sm text-red-500">{postError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPostChannelId(null)} disabled={posting}>
              Cancel
            </Button>
            <Button onClick={handlePostToChannel} disabled={posting || !postText.trim()}>
              {posting ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
