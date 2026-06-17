import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { ConvSummary, Filter } from '../inbox.types';

export function useConversationList() {
  const [list, setList] = useState<ConvSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = async (f: Filter, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      if (f !== 'all') params.append('filter', f);
      if (q) params.append('q', q);
      const result = await api<ConvSummary[]>(`/conversations?${params}`);
      setList(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList(filter, search);
  }, [filter, search]);

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleNewMessage = (data: any) => {
        setList((prev) =>
          prev.map((conv) =>
            conv.id === data.conversationId
              ? {
                  ...conv,
                  lastMessage: data.message?.content ?? null,
                  lastMessageAt: new Date().toISOString(),
                  unreadCount: (conv.unreadCount ?? 0) + 1,
                }
              : conv,
          ),
        );
      };
      socket.on('message:new', handleNewMessage);
      return () => {
        socket.off('message:new', handleNewMessage);
      };
    }
  }, []);

  return {
    list,
    filter,
    setFilter,
    search,
    setSearch,
    loading,
    error,
    refetch: () => fetchList(filter, search),
  };
}
