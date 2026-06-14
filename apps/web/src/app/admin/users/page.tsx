'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, UsersRound, ShieldAlert } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectField } from '@/components/ui/Field';

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

const roleOptions = (
  <>
    <option value="admin">Admin</option>
    <option value="supervisor">Supervisor</option>
    <option value="owner">Owner</option>
    <option value="viewer">Viewer</option>
  </>
);

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

function FormError({ message }: { message: string }) {
  return (
    <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">
      {message}
    </p>
  );
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
      setError('Email dan password wajib diisi');
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
      setError(err instanceof Error ? err.message : 'Gagal membuat pengguna');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah pengguna"
      description="Buat akun untuk anggota tim baru."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" form="create-user-form" disabled={isLoading}>{isLoading ? 'Menyimpan…' : 'Buat pengguna'}</Button>
        </>
      }
    >
      {error && <FormError message={error} />}
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nama (opsional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        <Field label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 8 karakter" hint="Minimal 8 karakter." />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{roleOptions}</SelectField>
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
      setError(err instanceof Error ? err.message : 'Gagal memperbarui pengguna');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit pengguna"
      description={user.email}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" form="edit-user-form" disabled={isLoading}>{isLoading ? 'Menyimpan…' : 'Simpan perubahan'}</Button>
        </>
      }
    >
      {error && <FormError message={error} />}
      <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nama" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{roleOptions}</SelectField>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({ user, onClose, onConfirm, isLoading }: { user: User; onClose: () => void; onConfirm: () => void; isLoading: boolean }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Hapus pengguna"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {isLoading ? 'Menghapus…' : 'Hapus pengguna'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Yakin ingin menghapus <span className="font-semibold text-gray-900 dark:text-gray-100">{user.email}</span>? Tindakan ini tidak bisa dibatalkan.
      </p>
    </Modal>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{ users: User[] }>('/users');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna');
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
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-review-50 dark:bg-review-900/20">
            <ShieldAlert className="h-5 w-5 text-review-600" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Akses dibatasi</p>
          <p className="mt-1 max-w-sm text-[13px] text-gray-500">
            You do not have permission to view this page. Hubungi owner untuk meminta akses manajemen tim.
          </p>
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
      setError(err instanceof Error ? err.message : 'Gagal menghapus pengguna');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Team" subtitle="Kelola pengguna sistem dan hak aksesnya">
        {authUser?.role === 'owner' && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Create user
          </Button>
        )}
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-auto p-5">
        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <button onClick={loadUsers} className="mt-2 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">Coba lagi</button>
          </Card>
        )}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-12 rounded animate-shimmer" />)}
          </div>
        ) : users.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <UsersRound className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Belum ada pengguna</p>
            <p className="mt-1 text-[13px] text-gray-400">Tambahkan anggota tim pertama untuk mulai berkolaborasi.</p>
            {authUser?.role === 'owner' && (
              <Button size="sm" className="mt-4" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Create user
              </Button>
            )}
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Dibuat</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
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
                              Hapus
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
