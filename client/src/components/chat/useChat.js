import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getAccessToken, parseApiError, refreshSession } from '@/api/client';
import { guestSessionId, newSessionId } from '@/lib/chat';

const URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

/**
 * The chat's state and its `/chat` Socket.io connection (guests allowed, FR-45).
 * Replies stream in as chat:token events and settle on chat:done (FR-49).
 */
export function useChat({ userId }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState('');
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = sessionId;

  // Load the saved conversation (FR-51): signed-in users get their latest chat from the server.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const guestId = userId ? null : guestSessionId();
    api
      .get('/chat/history', { params: guestId ? { sessionId: guestId } : {} })
      .then(({ data }) => {
        if (cancelled) return;
        setSessionId(data.sessionId ?? guestId ?? newSessionId());
        setMessages(data.messages);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setSessionId(guestId ?? newSessionId());
        setMessages([]);
        setStatus('ready'); // history is a nice-to-have; chatting still works
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const s = io(`${URL}/chat`, {
      auth: (cb) => cb(userId && getAccessToken() ? { token: getAccessToken() } : {}),
      withCredentials: true,
    });
    let refreshing = false;
    s.on('connect_error', async (err) => {
      if (err.message !== 'unauthorized' || refreshing) return;
      refreshing = true;
      try {
        await refreshSession();
        s.connect();
      } catch {
        /* the HTTP interceptor signs the user out */
      } finally {
        refreshing = false;
      }
    });
    const mine = (e) => e.sessionId === sessionRef.current;
    const patchLast = (fn) =>
      setMessages((list) => {
        const i = list.findLastIndex((m) => m.role === 'assistant' && m.pending);
        if (i < 0) return list;
        const next = list.slice();
        next[i] = fn(next[i]);
        return next;
      });
    s.on('chat:token', (e) => mine(e) && patchLast((m) => ({ ...m, content: m.content + e.token })));
    s.on('chat:replace', (e) => mine(e) && patchLast((m) => ({ ...m, content: e.text })));
    s.on('chat:done', (e) => {
      if (!mine(e)) return;
      patchLast((m) => ({ ...m, id: e.messageId, sources: e.sources, confident: e.confident, intent: e.intent, pending: false, content: m.content.trim() }));
      setStreaming(false);
    });
    s.on('chat:error', (e) => {
      if (!mine(e)) return;
      patchLast((m) => ({ ...m, pending: false, failed: true, content: m.content || e.error }));
      setStreaming(false);
    });
    s.on('disconnect', () => {
      // Only a reply still in progress is affected.
      patchLast((m) => ({ ...m, pending: false, failed: true, content: m.content || 'Connection lost. Please ask again.' }));
      setStreaming(false);
    });
    socketRef.current = s;
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const send = useCallback(
    (text) => {
      const message = text.trim();
      const s = socketRef.current;
      if (!message || streaming || !sessionId || !s) return false;
      setNotice('');
      setStreaming(true);
      const localId = `local-${Date.now()}`;
      setMessages((list) => [...list, { id: localId, role: 'user', content: message }, { id: `${localId}-a`, role: 'assistant', content: '', pending: true }]);
      s.timeout(10_000).emit('chat:message', { sessionId, message }, (err, ack) => {
        if (!err && ack?.ok) return;
        // Not accepted (rate limit, validation, offline): take both bubbles back out.
        setMessages((list) => list.filter((m) => m.id !== localId && m.id !== `${localId}-a`));
        setNotice(err ? 'Can’t reach the assistant. Check your connection and try again.' : ack.error);
        setStreaming(false);
      });
      return true;
    },
    [sessionId, streaming],
  );

  const rate = useCallback(
    async (messageId, rating) => {
      const before = messages.find((m) => m.id === messageId)?.rating ?? null;
      const value = before === rating ? null : rating; // tap again to clear
      setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, rating: value } : m)));
      try {
        await api.patch(`/chat/messages/${messageId}/rating`, { rating: value, ...(userId ? {} : { sessionId }) });
      } catch (err) {
        setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, rating: before } : m)));
        setNotice(parseApiError(err).message);
      }
    },
    [messages, sessionId, userId],
  );

  const reset = useCallback(() => {
    if (streaming) return;
    setSessionId(userId ? newSessionId() : guestSessionId({ reset: true }));
    setMessages([]);
    setNotice('');
  }, [streaming, userId]);

  return { sessionId, messages, status, streaming, notice, send, rate, reset };
}
