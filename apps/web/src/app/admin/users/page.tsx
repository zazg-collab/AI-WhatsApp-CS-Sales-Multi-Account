'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, PencilSimple, Trash, UsersThree, ShieldWarning } from '@phosphor-icons/react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

// ── i18n ───────────────────────────────────────────────────────────────────────

const dict: Dict = {
  // Role options
  roleAdmin: { id: 'Admin', en: 'Admin' },
  roleSupervisor: { id: 'Supervisor', en: 'Supervisor' },
  roleOwner: { id: 'Owner', en: 'Owner' },
  roleViewer: { id: 'Viewer', en: 'Viewer' },

  // Shared
  cancel: { id: 'Batal', en: 'Cancel' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  roleLabel: { id: 'Role', en: 'Role' },
  emailLabel: { id: 'Email', en: 'Email' },

  // CreateUserModal
  errEmailPasswordRequired: { id: 'Email dan password wajib diisi', en: 'Email and password are required' },
  errCreateUser: { id: 'Gagal membuat pengguna', en: 'Failed to create user' },
  createUserTitle: { id: 'Tambah pengguna', en: 'Add user' },
  createUserDesc: { id: 'Buat akun untuk anggota tim baru.', en: 'Create an account for a new team member.' },
  createUserBtn: { id: 'Buat pengguna', en: 'Create user' },
  nameOptionalLabel: { id: 'Nama (opsional)', en: 'Name (optional)' },
  passwordLabel: { id: 'Password', en: 'Password' },
  passwordPlaceholder: { id: 'Minimal 8 karakter', en: 'At least 8 characters' },
  passwordHint: { id: 'Minimal 8 karakter.', en: 'At least 8 characters.' },

  // EditUserModal
  errUpdateUser: { id: 'Gagal memperbarui pengguna', en: 'Failed to update user' },
  editUserTitle: { id: 'Edit pengguna', en: 'Edit user' },
  saveChanges: { id: 'Simpan perubahan', en: 'Save changes' },
  nameLabel: { id: 'Nama', en: 'Name' },

  // DeleteConfirmModal
  deleteUserTitle: { id: 'Hapus pengguna', en: 'Delete user' },
  deleting: { id: 'Menghapus…', en: 'Deleting…' },
  deleteUserBtn: { id: 'Hapus pengguna', en: 'Delete user' },
  deleteConfirmPre: { id: 'Yakin ingin menghapus ', en: 'Are you sure you want to delete ' },
  deleteConfirmPost: { id: '? Tindakan ini tidak bisa dibatalkan.', en: '? This action cannot be undone.' },

  // Main page
  errLoadUsers: { id: 'Gagal memuat daftar pengguna', en: 'Failed to load the user list' },
  errDeleteUser: { id: 'Gagal menghapus pengguna', en: 'Failed to delete user' },
  pageSubtitle: { id: 'Kelola pengguna sistem dan hak aksesnya', en: 'Manage system users and their access rights' },
  accessRestricted: { id: 'Akses dibatasi', en: 'Access restricted' },
  noPermissionHint: { id: 'You do not have permission to view this page. Hubungi owner untuk meminta akses manajemen tim.', en: 'You do not have permission to view this page. Contact the owner to request team management access.' },
  tryAgain: { id: 'Coba lagi', en: 'Try again' },
  noUsers: { id: 'Belum ada pengguna', en: 'No users yet' },
  noUsersHint: { id: 'Tambahkan anggota tim pertama untuk mulai berkolaborasi.', en: 'Add your first team member to start collaborating.' },
  thNama: { id: 'Nama', en: 'Name' },
  thStatus: { id: 'Status', en: 'Status' },
  thDibuat: { id: 'Dibuat', en: 'Created' },
  thAksi: { id: 'Aksi', en: 'Actions' },
  edit: { id: 'Edit', en: 'Edit' },
  delete: { id: 'Hapus', en: 'Delete' },
};

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

function RoleOptions() {
  const t = useT(dict);
  return (
    <>
      <option value="admin">{t('roleAdmin')}</option>
      <option value="supervisor">{t('roleSupervisor')}</option>
      <option value="owner">{t('roleOwner')}</option>
      <option value="viewer">{t('roleViewer')}</option>
    </>
  );
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

function FormError({ message }: { message: string }) {
  return (
    <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">
      {message}
    </p>
  );
}

function CreateUserModal({ onClose, onSuccess, isLoading }: { onClose: () => void; onSuccess: () => void; isLoading: boolean }) {
  const t = useT(dict);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'owner' | 'viewer'>('admin');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError(t('errEmailPasswordRequired'));
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
      setError(err instanceof Error ? err.message : t('errCreateUser'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('createUserTitle')}
      description={t('createUserDesc')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="create-user-form" disabled={isLoading}>{isLoading ? t('saving') : t('createUserBtn')}</Button>
        </>
      }
    >
      {error && <FormError message={error} />}
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label={t('nameOptionalLabel')} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        <Field label={t('emailLabel')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        <Field label={t('passwordLabel')} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('passwordPlaceholder')} hint={t('passwordHint')} />
        <SelectField label={t('roleLabel')} value={role} onChange={(e) => setRole(e.target.value as typeof role)}><RoleOptions /></SelectField>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSuccess, isLoading }: { user: User; onClose: () => void; onSuccess: () => void; isLoading: boolean }) {
  const t = useT(dict);
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
      setError(err instanceof Error ? err.message : t('errUpdateUser'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('editUserTitle')}
      description={user.email}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="edit-user-form" disabled={isLoading}>{isLoading ? t('saving') : t('saveChanges')}</Button>
        </>
      }
    >
      {error && <FormError message={error} />}
      <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label={t('nameLabel')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('emailLabel')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label={t('roleLabel')} value={role} onChange={(e) => setRole(e.target.value as typeof role)}><RoleOptions /></SelectField>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({ user, onClose, onConfirm, isLoading }: { user: User; onClose: () => void; onConfirm: () => void; isLoading: boolean }) {
  const t = useT(dict);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('deleteUserTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
            <Trash className="h-4 w-4" aria-hidden="true" />
            {isLoading ? t('deleting') : t('deleteUserBtn')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('deleteConfirmPre')}<span className="font-semibold text-gray-900 dark:text-gray-100">{user.email}</span>{t('deleteConfirmPost')}
      </p>
    </Modal>
  );
}

export default function UsersPage() {
  const t = useT(dict);
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
      setError(err instanceof Error ? err.message : t('errLoadUsers'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setAuthUser(getRoleFromToken());
    loadUsers();
  }, [loadUsers]);

  if (!authUser || (authUser.role !== 'owner' && authUser.role !== 'supervisor')) {
    return (
      <AppLayout>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-review-50 dark:bg-review-900/20">
            <ShieldWarning className="h-5 w-5 text-review-600" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('accessRestricted')}</p>
          <p className="mt-1 max-w-sm text-[13px] text-gray-500">
            {t('noPermissionHint')}
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
      setError(err instanceof Error ? err.message : t('errDeleteUser'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Team" subtitle={t('pageSubtitle')}>
        {authUser?.role === 'owner' && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create user
          </Button>
        )}
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-auto p-5">
        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <button onClick={loadUsers} className="mt-2 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">{t('tryAgain')}</button>
          </Card>
        )}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-12 rounded animate-shimmer" />)}
          </div>
        ) : users.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <UsersThree className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noUsers')}</p>
            <p className="mt-1 text-[13px] text-gray-400">{t('noUsersHint')}</p>
            {authUser?.role === 'owner' && (
              <Button size="sm" className="mt-4" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create user
              </Button>
            )}
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-3 font-medium">{t('emailLabel')}</th>
                  <th className="px-4 py-3 font-medium">{t('thNama')}</th>
                  <th className="px-4 py-3 font-medium">{t('roleLabel')}</th>
                  <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                  <th className="px-4 py-3 font-medium">{t('thDibuat')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('thAksi')}</th>
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
                              <PencilSimple className="h-4 w-4" aria-hidden="true" />
                              {t('edit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeletingUser(user)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                              <Trash className="h-4 w-4" aria-hidden="true" />
                              {t('delete')}
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
