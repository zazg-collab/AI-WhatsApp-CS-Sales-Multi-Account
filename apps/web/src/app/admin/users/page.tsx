'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

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

function roleColor(role: string) {
  const colors: Record<string, string> = {
    owner: 'bg-red-700',
    supervisor: 'bg-orange-700',
    admin: 'bg-blue-700',
    viewer: 'bg-gray-700',
  };
  return colors[role] || 'bg-gray-700';
}

function CreateUserModal({
  onClose,
  onSuccess,
  isLoading,
}: {
  onClose: () => void;
  onSuccess: () => void;
  isLoading: boolean;
}) {
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
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          password: password.trim(),
          role,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-100">Create User</h3>
        {error && <p className="mb-4 rounded bg-red-900/30 p-2 text-sm text-red-300">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
            >
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="owner">Owner</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
            >
              {isLoading ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-gray-700 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSuccess,
  isLoading,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
  isLoading: boolean;
}) {
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
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-100">Edit User</h3>
        {error && <p className="mb-4 rounded bg-red-900/30 p-2 text-sm text-red-300">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
            >
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="owner">Owner</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-gray-700 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  user,
  onClose,
  onConfirm,
  isLoading,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-100">Delete User</h3>
        <p className="mb-4 text-sm text-gray-400">
          Are you sure you want to delete <span className="font-medium">{user.email}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 rounded bg-red-700 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-red-600"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded bg-gray-700 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
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
    const auth = getRoleFromToken();
    setAuthUser(auth);
    loadUsers();
  }, [loadUsers]);

  // Check if user is authorized
  if (!authUser || (authUser.role !== 'owner' && authUser.role !== 'supervisor')) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center flex-1">
          <p className="text-gray-400">You do not have permission to view this page.</p>
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
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-700 bg-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">Users</h1>
              <p className="text-sm text-gray-400">Manage system users and roles</p>
            </div>
            {authUser?.role === 'owner' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                + Create User
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <p className="text-gray-400">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-gray-400">No users found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700 bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Created At</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-gray-100">{user.email}</td>
                      <td className="px-4 py-3 text-gray-300">{user.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-1 text-xs font-medium text-white ${roleColor(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{user.status}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {authUser?.role === 'owner' && (
                            <>
                              <button
                                onClick={() => setEditingUser(user)}
                                className="rounded bg-blue-700/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-700/40"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeletingUser(user)}
                                className="rounded bg-red-700/20 px-2 py-1 text-xs text-red-300 hover:bg-red-700/40"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadUsers}
          isLoading={isSubmitting}
        />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={loadUsers}
          isLoading={isSubmitting}
        />
      )}
      {deletingUser && (
        <DeleteConfirmModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={() => handleDelete(deletingUser)}
          isLoading={isSubmitting}
        />
      )}
    </AppLayout>
  );
}
