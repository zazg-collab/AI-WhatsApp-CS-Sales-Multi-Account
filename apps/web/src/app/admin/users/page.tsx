'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, UsersRound } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, fieldControl } from '@/components/ui/Field';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'supervisor' | 'admin' | 'viewer';
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

interface AuthUser {
  role: 'owner' | 'supervisor' | 'admin' | 'viewer';
}

type BadgeTone = 'danger' | 'review' | 'hermes' | 'neutral' | 'success';

const roleTone: Record<string, BadgeTone> = {
  owner: 'danger',
  supervisor: 'review',
  admin: 'hermes',
  viewer: 'neutral',
};

function getRoleFromToken(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return { role: payload.role };
  } catch {
    return null;
  }
}

function CreateUserModal({ onClose, onSuccess, isLoading }: { onClose: () => void; onSuccess: () => void; isLoading: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'owner' | 'viewer'>('admin');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim(), password: password.trim(), role }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  return (
    <Modal title="Create user" onClose={onClose} size="sm">
      {error && <p className="mb-4 rounded-lg bg-danger-50 p-2 text-sm text-danger-700 dark:bg-danger-700/10 dark:text-danger-500">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name (optional)">
          {(id) => <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className={fieldControl} />}
        </Field>
        <Field label="Email">
          {(id) => <input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className={fieldControl} required />}
        </Field>
        <Field label="Password">
          {(id) => <input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={fieldControl} required />}
        </Field>
        <Field label="Role">
          {(id) => (
            <select id={id} value={role} onChange={(e) => setRole(e.target.value as any)} className={fieldControl}>
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="owner">Owner</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
        </Field>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isLoading} className="flex-1">{isLoading ? 'Creating…' : 'Create'}</Button>
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSuccess, isLoading }: { user: User; onClose: () => void; onSuccess: () => void; isLoading: boolean }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  return (
    <Modal title="Edit user" onClose={onClose} size="sm">
      {error && <p className="mb-4 rounded-lg bg-danger-50 p-2 text-sm text-danger-700 dark:bg-danger-700/10 dark:text-danger-500">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name">
          {(id) => <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldControl} />}
        </Field>
        <Field label="Email">
          {(id) => <input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldControl} />}
        </Field>
        <Field label="Role">
          {(id) => (
            <select id={id} value={role} onChange={(e) => setRole(e.target.value as any)} className={fieldControl}>
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="owner">Owner</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
        </Field>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isLoading} className="flex-1">{isLoading ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({ user, onClose, onConfirm, isLoading }: { user: User; onClose: () => void; onConfirm: () => void; isLoading: boolean }) {
  return (
    <Modal title="Delete user" onClose={onClose} size="sm">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Are you sure you want to delete <span className="font-medium text-gray-800 dark:text-gray-200">{user.email}</span>? This action cannot be undone.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" onClick={onConfirm} disabled={isLoading} className="flex-1">
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {isLoading ? 'Deleting…' : 'Delete'}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<{ users: User[] }>('/users');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAuthUser(getRoleFromToken());
    loadUsers();
  }, [loadUsers]);

  if (!authUser || (authUser.role !== 'owner' && authUser.role !== 'supervisor')) {
    return (
      <AppLayout>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">You do not have permission to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  async function handleDelete(user: User) {
    setIsSubmitting(true);
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' });
      setDeletingUser(null);
      await loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Team" subtitle="Manage system users and roles">
        {authUser?.role === 'owner' && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Create user
          </Button>
        )}
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-auto p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Loading users…</p>
        ) : users.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <UsersRound className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm text-gray-400">No users found.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.name}</td>
                    <td className="px-4 py-3">
                      <Badge tone={roleTone[user.role] ?? 'neutral'}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {authUser?.role === 'owner' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeletingUser(user)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} onSuccess={loadUsers} isLoading={isSubmitting} />}
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSuccess={loadUsers} isLoading={isSubmitting} />}
      {deletingUser && <DeleteConfirmModal user={deletingUser} onClose={() => setDeletingUser(null)} onConfirm={() => handleDelete(deletingUser)} isLoading={isSubmitting} />}
    </AppLayout>
  );
}
