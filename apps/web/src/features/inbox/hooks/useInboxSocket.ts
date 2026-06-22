'use client';

import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getSocket } from '@/lib/socket';
import { playNotificationSound } from './inbox.notifications';
import type { ConvDetail, Message } from '../inbox.types';

type TypingCustomer = { conversationId: string; phone: string } | null;

interface UseInboxSocketParams {
  /** Ref to the currently-open conversation id (kept fresh by the caller). */
  activeIdRef: MutableRefObject<string | null>;
  /** Reloads the conversation list (debounced internally). */
  loadList: () => void | Promise<void>;
  /** Reloads a single conversation by id. */
  loadConv: (id: string) => Promise<void> | void;
  setConv: Dispatch<SetStateAction<ConvDetail | null>>;
  setTypingCustomer: Dispatch<SetStateAction<TypingCustomer>>;
}

/**
 * All live Socket.IO wiring for the inbox: incoming/draft/status/edit/delete/
 * reaction message events, conversation/SLA/Hermes/account refresh triggers,
 * and customer typing presence. Extracted from useInbox so the realtime
 * reconciliation logic lives in one focused place. Behaviour is unchanged —
 * the effect mounts once and patches `conv`/list via the passed setters/refs.
 */
export function useInboxSocket({
  activeIdRef,
  loadList,
  loadConv,
  setConv,
  setTypingCustomer,
}: UseInboxSocketParams) {
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const loadConvRef = useRef(loadConv);
  loadConvRef.current = loadConv;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    let listTimer: ReturnType<typeof setTimeout> | null = null;
    let convTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleListReload = () => {
      if (listTimer) clearTimeout(listTimer);
      listTimer = setTimeout(() => loadListRef.current(), 500);
    };
    const scheduleConvReload = () => {
      const curId = activeIdRef.current;
      if (!curId) return;
      if (convTimer) clearTimeout(convTimer);
      convTimer = setTimeout(() => loadConvRef.current(curId), 500);
    };

    const upsert = (conversationId: string, message: Message) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    };

    const onNew = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      upsert(conversationId, message);
      scheduleListReload();
      if (conversationId === activeIdRef.current) scheduleConvReload();
      if (message.senderType === 'customer') {
        setTypingCustomer((prev) => (prev?.conversationId === conversationId ? null : prev));
      }
      if (
        message.senderType === 'customer' &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || conversationId !== activeIdRef.current)
      ) {
        try {
          new Notification('Customer', {
            body: message.content ? message.content.substring(0, 100) : '[Media message]',
            tag: conversationId,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
          });
          playNotificationSound();
        } catch { /* ignore */ }
      }
    };

    const onDraft = ({ conversationId, message }: { conversationId: string; message: Message }) =>
      upsert(conversationId, message);

    const onDraftRemoved = ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) }
          : prev,
      );

    const onStatus = ({ conversationId, messageId, status }: { conversationId: string; messageId: string; status: string }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status } : m)) }
          : prev,
      );

    const onMessageUpdated = ({ conversationId, message }: { conversationId: string; message: Message }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)) }
          : prev,
      );

    // Patch a single message field-set in place (edit/delete/reaction made by
    // another admin or mirrored from the WhatsApp phone). Without these the
    // timeline silently diverges until a manual reload.
    const patchMessage = (conversationId: string, messageId: string, patch: Partial<Message>) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }
          : prev,
      );

    const onEdited = ({ conversationId, messageId, content }: { conversationId: string; messageId: string; content: string }) =>
      patchMessage(conversationId, messageId, { content, editedAt: new Date().toISOString() });

    const onDeleted = ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      patchMessage(conversationId, messageId, { deletedAt: new Date().toISOString() });

    const onReaction = ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Record<string, string[]> | null }) =>
      patchMessage(conversationId, messageId, { reactions });

    const onConvUpdate = () => { scheduleListReload(); scheduleConvReload(); };

    const onPresence = ({ phone, typing }: { accountId: string; phone: string; typing: boolean }) => {
      setTypingCustomer((prev) => {
        const next = typing
          ? { conversationId: activeIdRef.current ?? '', phone }
          : prev?.phone === phone ? null : prev;
        if (next && prev && next.phone === prev.phone && next.conversationId === prev.conversationId) return prev;
        if (!next && !prev) return prev;
        return next;
      });
    };

    socket.on('message:new', onNew);
    socket.on('message:draft', onDraft);
    socket.on('message:draft-removed', onDraftRemoved);
    socket.on('message:status', onStatus);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:edited', onEdited);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('conversation:updated', onConvUpdate);
    socket.on('conversation:sla-breach', onConvUpdate);
    socket.on('conversation:sla-cleared', onConvUpdate);
    socket.on('hermes:alert', onConvUpdate);
    socket.on('customer:avatar', onConvUpdate);
    // Account connect/disconnect → refresh the open conversation so the header
    // status and composer block reflect the new sessionStatus live.
    socket.on('wa:status', onConvUpdate);
    socket.on('wa:presence', onPresence);

    return () => {
      if (listTimer) clearTimeout(listTimer);
      if (convTimer) clearTimeout(convTimer);
      socket.off('message:new', onNew);
      socket.off('message:draft', onDraft);
      socket.off('message:draft-removed', onDraftRemoved);
      socket.off('message:status', onStatus);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:edited', onEdited);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('conversation:updated', onConvUpdate);
      socket.off('conversation:sla-breach', onConvUpdate);
      socket.off('conversation:sla-cleared', onConvUpdate);
      socket.off('hermes:alert', onConvUpdate);
      socket.off('customer:avatar', onConvUpdate);
      socket.off('wa:status', onConvUpdate);
      socket.off('wa:presence', onPresence);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
