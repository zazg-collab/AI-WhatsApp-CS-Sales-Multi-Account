import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { ConvDetail, Message } from '../inbox.types';

export function useConversation(conversationId: string | null, messageLimit = 100) {
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  const fetchConversation = useCallback(async () => {
    if (!conversationId) {
      setConv(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api<ConvDetail>(
        `/conversations/${conversationId}?messageLimit=${messageLimit}`,
      );
      setConv(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageLimit]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    if (!socket || !conversationId) return;

    const handleNewMessage = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId === conversationId) {
        setConv((prev) =>
          prev ? { ...prev, messages: [...prev.messages, data.message] } : null,
        );
      }
    };

    const handleMessageUpdated = (data: { conversationId: string; messageId: string; changes: Partial<Message> }) => {
      if (data.conversationId === conversationId && conv) {
        setConv({
          ...conv,
          messages: conv.messages.map((m) =>
            m.id === data.messageId ? { ...m, ...data.changes } : m,
          ),
        });
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleMessageUpdated);
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleMessageUpdated);
    };
  }, [conversationId, conv]);

  return {
    conversation: conv,
    loading,
    error,
    refetch: fetchConversation,
  };
}
