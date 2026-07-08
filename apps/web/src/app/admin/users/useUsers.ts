'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './users.i18n';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'supervisor' | 'admin' | 'viewer';
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id?: string;
  role: 'owner' | 'supervisor' | 'admin' | 'viewer';
}

export type BadgeTone = 'danger' | 'review' | 'sentinel' | 'neutral' | 'success';

export const roleTone: Record<string, BadgeTone> = {
  owner: 'danger', supervisor: 'review', admin: 'sentinel', viewer: 'neutral',
};

export function getRoleFromToken(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return { id: payload.sub, role: payload.role };
  } catch { return null; }
}

export function useUsers() {
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

  return {
    t, users, loading, error, setError,
    showCreateModal, setShowCreateModal,
    editingUser, setEditingUser,
    deletingUser, setDeletingUser,
    isSubmitting, authUser,
    loadUsers, handleDelete,
  };
}
