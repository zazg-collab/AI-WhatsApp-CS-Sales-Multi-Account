'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  PencilSimple,
  Trash,
  CaretDown,
  CaretRight,
  UsersThree,
  CheckCircle,
  Copy,
  Link,
  UserPlus,
} from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sentinel-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

interface GroupChat {
  id: string; // JID e.g. 1234@g.us
  name: string;
  subject?: string;
  description?: string;
  participants?: Participant[];
}

interface Participant {
  id: string; // JID
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote';

export default function GroupsPage() {
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  // Expanded participant panels
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Create group modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createParticipants, setCreateParticipants] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join group modal
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Edit group modal
  const [editGroup, setEditGroup] = useState<GroupChat | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Invite code modal
  const [inviteModal, setInviteModal] = useState<{ groupId: string; code: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Leave confirmation
  const [leaveGroup, setLeaveGroup] = useState<GroupChat | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Participant management per-group state
  const [participantPhone, setParticipantPhone] = useState<Record<string, string>>({});
  const [participantAction, setParticipantAction] = useState<Record<string, ParticipantAction>>({});
  const [participantLoading, setParticipantLoading] = useState<Record<string, boolean>>({});
  const [participantError, setParticipantError] = useState<Record<string, string>>({});
  const [participantSuccess, setParticipantSuccess] = useState<Record<string, boolean>>({});

  // Load accounts on mount
  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((data) => {
        setAccounts(data ?? []);
        if (data?.length) setSelectedAccountId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  // Load groups when account changes
  useEffect(() => {
    if (!selectedAccountId) return;
    setLoadingGroups(true);
    setGroupsError(null);
    setGroups([]);
    api<{ chats: Array<{ id: string; name?: string; subject?: string; description?: string }> }>(
      `/wa/accounts/${selectedAccountId}/chats/overview`
    )
      .then((data) => {
        const chats = data?.chats ?? (Array.isArray(data) ? (data as GroupChat[]) : []);
        const filtered = chats
          .filter((c) => c.id?.endsWith('@g.us'))
          .map((c) => ({
            id: c.id,
            name: c.subject ?? c.name ?? c.id,
            subject: c.subject,
            description: c.description,
          }));
        setGroups(filtered);
      })
      .catch((err) => setGroupsError(err?.message ?? 'Failed to load groups'))
      .finally(() => setLoadingGroups(false));
  }, [selectedAccountId]);

  function groupPath(groupId: string) {
    return `/wa/accounts/${selectedAccountId}/groups/${encodeURIComponent(groupId)}`;
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const phones = createParticipants
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      await api(`/wa/accounts/${selectedAccountId}/groups`, {
        method: 'POST',
        body: JSON.stringify({ name: createName.trim(), participants: phones }),
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateParticipants('');
      // Reload groups
      setSelectedAccountId((id) => id); // trigger effect
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await api(`/wa/accounts/${selectedAccountId}/groups/join`, {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      setJoinOpen(false);
      setJoinCode('');
      // Reload
      setSelectedAccountId((id) => id);
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join group');
    } finally {
      setJoining(false);
    }
  }

  function openEdit(group: GroupChat) {
    setEditGroup(group);
    setEditSubject(group.subject ?? group.name ?? '');
    setEditDescription(group.description ?? '');
    setEditError(null);
  }

  async function handleEdit() {
    if (!editGroup) return;
    setEditing(true);
    setEditError(null);
    try {
      await api(groupPath(editGroup.id), {
        method: 'PUT',
        body: JSON.stringify({ subject: editSubject, description: editDescription }),
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === editGroup.id
            ? { ...g, name: editSubject || g.name, subject: editSubject, description: editDescription }
            : g
        )
      );
      setEditGroup(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update group');
    } finally {
      setEditing(false);
    }
  }

  async function handleGetInvite(groupId: string) {
    setInviteLoading(groupId);
    try {
      const data = await api<{ code: string }>(
        `/wa/accounts/${selectedAccountId}/groups/${encodeURIComponent(groupId)}/invite-code`
      );
      setInviteModal({ groupId, code: data.code });
      setCopied(false);
    } catch {
      // silently fail — could show toast
    } finally {
      setInviteLoading(null);
    }
  }

  async function handleLeave() {
    if (!leaveGroup) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await api(`${groupPath(leaveGroup.id)}/leave`, { method: 'POST' });
      setGroups((prev) => prev.filter((g) => g.id !== leaveGroup.id));
      setLeaveGroup(null);
    } catch (err: unknown) {
      setLeaveError(err instanceof Error ? err.message : 'Failed to leave group');
    } finally {
      setLeaving(false);
    }
  }

  async function handleParticipantAction(groupId: string) {
    const phone = (participantPhone[groupId] ?? '').trim();
    const action = participantAction[groupId] ?? 'add';
    if (!phone) return;
    setParticipantLoading((prev) => ({ ...prev, [groupId]: true }));
    setParticipantError((prev) => ({ ...prev, [groupId]: '' }));
    setParticipantSuccess((prev) => ({ ...prev, [groupId]: false }));
    try {
      await api(`${groupPath(groupId)}/participants`, {
        method: 'POST',
        body: JSON.stringify({ phones: [phone], action }),
      });
      setParticipantSuccess((prev) => ({ ...prev, [groupId]: true }));
      setParticipantPhone((prev) => ({ ...prev, [groupId]: '' }));
      setTimeout(() => setParticipantSuccess((prev) => ({ ...prev, [groupId]: false })), 2500);
    } catch (err: unknown) {
      setParticipantError((prev) => ({
        ...prev,
        [groupId]: err instanceof Error ? err.message : 'Action failed',
      }));
    } finally {
      setParticipantLoading((prev) => ({ ...prev, [groupId]: false }));
    }
  }

  function copyInviteCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AppLayout>
      <PageHeader title="Groups" subtitle="Manage WhatsApp groups for each account">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setJoinOpen(true); setJoinError(null); setJoinCode(''); }}>
            <Link className="h-4 w-4" aria-hidden="true" />
            Join Group
          </Button>
          <Button size="sm" onClick={() => { setCreateOpen(true); setCreateError(null); setCreateName(''); setCreateParticipants(''); }} disabled={!selectedAccountId}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Group
          </Button>
        </div>
      </PageHeader>

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
        {/* Account selector */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            WhatsApp Account
          </label>
          {loadingAccounts ? (
            <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ) : accounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No accounts found.</p>
          ) : (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              aria-label="Select account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.phoneNumber})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Group list */}
        {loadingGroups ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : groupsError ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-900/20">
            <p className="text-sm text-danger-700 dark:text-danger-300">{groupsError}</p>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800">
              <UsersThree className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No groups found</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              Create a new group or join an existing one via invite code.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => {
              const isExpanded = expandedGroup === group.id;
              return (
                <li key={group.id}>
                  <Card className="p-4">
                    {/* Group header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sentinel-100 text-sentinel-700 dark:bg-sentinel-900/30 dark:text-sentinel-400">
                          <UsersThree className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {group.name}
                          </p>
                          {group.description && (
                            <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                              {group.description}
                            </p>
                          )}
                          <p className="font-mono text-[10px] text-gray-300 dark:text-gray-600">
                            {group.id}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(group)}
                          title="Edit group"
                        >
                          <PencilSimple className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleGetInvite(group.id)}
                          disabled={inviteLoading === group.id}
                          title="Get invite code"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">
                            {inviteLoading === group.id ? 'Loading…' : 'Invite'}
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400"
                          onClick={() => { setLeaveGroup(group); setLeaveError(null); }}
                          title="Leave group"
                        >
                          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Leave</span>
                        </Button>
                        <button
                          type="button"
                          onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                          aria-expanded={isExpanded}
                          title={isExpanded ? 'Hide participants' : 'Manage participants'}
                          className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Members</span>
                          {isExpanded ? (
                            <CaretDown className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <CaretRight className="h-3 w-3" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Participant management panel */}
                    {isExpanded && (
                      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Participant Actions
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[140px]">
                            <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">
                              Phone number
                            </label>
                            <input
                              type="tel"
                              value={participantPhone[group.id] ?? ''}
                              onChange={(e) =>
                                setParticipantPhone((prev) => ({
                                  ...prev,
                                  [group.id]: e.target.value.replace(/[^\d]/g, ''),
                                }))
                              }
                              placeholder="628123456789"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">
                              Action
                            </label>
                            <select
                              value={participantAction[group.id] ?? 'add'}
                              onChange={(e) =>
                                setParticipantAction((prev) => ({
                                  ...prev,
                                  [group.id]: e.target.value as ParticipantAction,
                                }))
                              }
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            >
                              <option value="add">Add</option>
                              <option value="remove">Remove</option>
                              <option value="promote">Promote to Admin</option>
                              <option value="demote">Demote</option>
                            </select>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleParticipantAction(group.id)}
                            disabled={
                              participantLoading[group.id] ||
                              !(participantPhone[group.id] ?? '').trim()
                            }
                          >
                            {participantLoading[group.id] ? 'Working…' : 'Apply'}
                          </Button>
                        </div>
                        {participantError[group.id] && (
                          <p className="mt-2 text-xs text-danger-600 dark:text-danger-400">
                            {participantError[group.id]}
                          </p>
                        )}
                        {participantSuccess[group.id] && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-channel-700 dark:text-channel-400">
                            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Done
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create group modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Group"
        description="Create a new WhatsApp group on the selected account."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={creating || !createName.trim()} onClick={handleCreate}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {createError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {createError}
            </p>
          )}
          <Field
            label="Group name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="My Group"
          />
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Participants (comma-separated phones)
            </label>
            <textarea
              value={createParticipants}
              onChange={(e) => setCreateParticipants(e.target.value)}
              placeholder="628123456789, 628987654321"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Enter phone numbers with country code, separated by commas.
            </p>
          </div>
        </div>
      </Modal>

      {/* Join group modal */}
      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join Group"
        description="Join a WhatsApp group using an invite link code."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={joining || !joinCode.trim()} onClick={handleJoin}>
              {joining ? 'Joining…' : 'Join'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {joinError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {joinError}
            </p>
          )}
          <Field
            label="Invite code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.trim())}
            placeholder="AbCdEfGhIjKlMnOp"
          />
          <p className="text-[11px] text-gray-400">
            Paste just the code portion from a WhatsApp invite link
            (e.g. the part after chat.whatsapp.com/invite/).
          </p>
        </div>
      </Modal>

      {/* Edit group modal */}
      <Modal
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        title="Edit Group"
        description="Update the group subject and description."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditGroup(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={editing || !editSubject.trim()} onClick={handleEdit}>
              {editing ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {editError && (
            <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
              {editError}
            </p>
          )}
          <Field
            label="Subject"
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            placeholder="Group name"
          />
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Group description (optional)"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
      </Modal>

      {/* Invite code modal */}
      <Modal
        open={!!inviteModal}
        onClose={() => setInviteModal(null)}
        title="Invite Code"
        description="Share this code to invite people to the group."
        size="sm"
        footer={
          <Button variant="outline" size="sm" onClick={() => setInviteModal(null)}>
            Close
          </Button>
        }
      >
        {inviteModal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-sentinel-200 bg-sentinel-50 p-4 dark:border-sentinel-700/40 dark:bg-sentinel-900/20">
              <p className="select-all break-all text-center font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">
                {inviteModal.code}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copyInviteCode(inviteModal.code)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sentinel-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sentinel-700"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy code
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-gray-400">
              Invite link: https://chat.whatsapp.com/{inviteModal.code}
            </p>
          </div>
        )}
      </Modal>

      {/* Leave confirmation modal */}
      <Modal
        open={!!leaveGroup}
        onClose={() => setLeaveGroup(null)}
        title="Leave Group"
        description={leaveGroup ? `Are you sure you want to leave "${leaveGroup.name}"?` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLeaveGroup(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-danger-600 hover:bg-danger-700"
              disabled={leaving}
              onClick={handleLeave}
            >
              {leaving ? 'Leaving…' : 'Leave group'}
            </Button>
          </>
        }
      >
        {leaveError && (
          <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            {leaveError}
          </p>
        )}
      </Modal>
    </AppLayout>
  );
}
