'use client';

import { Plus, PencilSimple, Trash, UsersThree, ShieldWarning } from '@phosphor-icons/react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectField } from '@/components/ui/Field';
import { useT } from '@/lib/i18n';
import { useUsers, roleTone, type User } from './useUsers';
import { dict } from './users.i18n';
import { useState } from 'react';

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

function FormError({ message }: { message: string }) {
  return <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">{message}</p>;
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
    if (!email.trim() || !password.trim()) { setError(t('errEmailPasswordRequired')); return; }
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ name: name.trim() || undefined, email: email.trim(), password: password.trim(), role }) });
      onSuccess(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : t('errCreateUser')); }
  }

  return (
    <Modal open onClose={onClose} title={t('createUserTitle')} description={t('createUserDesc')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button type="submit" form="create-user-form" disabled={isLoading}>{isLoading ? t('saving') : t('createUserBtn')}</Button></>}
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
      await api(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), email: email.trim(), role }) });
      onSuccess(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : t('errUpdateUser')); }
  }

  return (
    <Modal open onClose={onClose} title={t('editUserTitle')} description={user.email}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button type="submit" form="edit-user-form" disabled={isLoading}>{isLoading ? t('saving') : t('saveChanges')}</Button></>}
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
    <Modal open onClose={onClose} size="sm" title={t('deleteUserTitle')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button variant="danger" onClick={onConfirm} disabled={isLoading}><Trash className="h-4 w-4" aria-hidden="true" />{isLoading ? t('deleting') : t('deleteUserBtn')}</Button></>}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('deleteConfirmPre')}<span className="font-semibold text-gray-900 dark:text-gray-100">{user.email}</span>{t('deleteConfirmPost')}</p>
    </Modal>
  );
}

export default function UsersPage() {
  const { t, users, loading, error, showCreateModal, setShowCreateModal, editingUser, setEditingUser, deletingUser, setDeletingUser, isSubmitting, authUser, loadUsers, handleDelete } = useUsers();

  if (!authUser || (authUser.role !== 'owner' && authUser.role !== 'supervisor')) {
    return (
      <AppLayout>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-review-50 dark:bg-review-900/20">
            <ShieldWarning className="h-5 w-5 text-review-600" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('accessRestricted')}</p>
          <p className="mt-1 max-w-sm text-[13px] text-gray-500">{t('noPermissionHint')}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')}>
        {authUser?.role === 'owner' && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t('createUserBtnTop')}</Button>
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
          <div className="space-y-2">{[1,2,3,4].map((n) => <div key={n} className="h-12 rounded animate-shimmer" />)}</div>
        ) : users.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <UsersThree className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noUsers')}</p>
            <p className="mt-1 text-[13px] text-gray-400">{t('noUsersHint')}</p>
            {authUser?.role === 'owner' && <Button size="sm" className="mt-4" onClick={() => setShowCreateModal(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t('createUserBtnTop')}</Button>}
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {/* Desktop / tablet: data table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th scope="col" className="px-4 py-3 font-medium">{t('emailLabel')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('thNama')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('roleLabel')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('thStatus')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('thDibuat')}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">{t('thAksi')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const ownerCount = users.filter((u) => u.role === 'owner').length;
                    const isSelf = authUser?.id === user.id;
                    const isLastOwner = user.role === 'owner' && ownerCount <= 1;
                    const deleteBlockedReason = isSelf ? t('cantDeleteSelf') : isLastOwner ? t('cantDeleteLastOwner') : null;
                    return (
                      <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={user.name} phone={user.email} className="h-7 w-7 shrink-0 text-[10px]" />
                            <span className="text-gray-900 dark:text-gray-100">{user.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.name}</td>
                        <td className="px-4 py-3"><Badge tone={roleTone[user.role] ?? 'neutral'}>{user.role}</Badge></td>
                        <td className="px-4 py-3"><Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge></td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          {authUser?.role === 'owner' && (
                            <div className="flex justify-end gap-1.5">
                              <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}><PencilSimple className="h-4 w-4" aria-hidden="true" />{t('edit')}</Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeletingUser(user)} disabled={!!deleteBlockedReason} title={deleteBlockedReason ?? undefined} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10"><Trash className="h-4 w-4" aria-hidden="true" />{t('delete')}</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
              {users.map((user) => {
                const ownerCount = users.filter((u) => u.role === 'owner').length;
                const isSelf = authUser?.id === user.id;
                const isLastOwner = user.role === 'owner' && ownerCount <= 1;
                const deleteBlockedReason = isSelf ? t('cantDeleteSelf') : isLastOwner ? t('cantDeleteLastOwner') : null;
                return (
                  <div key={user.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={roleTone[user.role] ?? 'neutral'}>{user.role}</Badge>
                        <Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">{t('thDibuat')}: {new Date(user.createdAt).toLocaleDateString()}</span>
                      {authUser?.role === 'owner' && (
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}><PencilSimple className="h-4 w-4" aria-hidden="true" />{t('edit')}</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingUser(user)} disabled={!!deleteBlockedReason} title={deleteBlockedReason ?? undefined} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10"><Trash className="h-4 w-4" aria-hidden="true" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} onSuccess={loadUsers} isLoading={isSubmitting} />}
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSuccess={loadUsers} isLoading={isSubmitting} />}
      {deletingUser && <DeleteConfirmModal user={deletingUser} onClose={() => setDeletingUser(null)} onConfirm={() => handleDelete(deletingUser)} isLoading={isSubmitting} />}
    </AppLayout>
  );
}
