import { ChatMessage } from '../models/ChatMessage.js';
import { assertSessionOwner } from '../services/chatAccess.js';
import { streamChat } from '../services/rag.js';
import { logger } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { chatMessageSchema } from '../validators/chat.js';

export const CHAT_LIMIT = { max: 8, windowMs: 60_000 }; // per user (or guest IP) — NFR-5
const UNAVAILABLE = 'The assistant is unavailable right now. Please try again in a minute.';
const recent = new Map(); // key → timestamps of recent messages

export function allowMessage(key, now = Date.now()) {
  const times = (recent.get(key) ?? []).filter((t) => now - t < CHAT_LIMIT.windowMs);
  if (times.length >= CHAT_LIMIT.max) {
    recent.set(key, times);
    return false;
  }
  times.push(now);
  recent.set(key, times);
  if (recent.size > 10_000) recent.delete(recent.keys().next().value); // bound memory
  return true;
}
export const _resetChatLimits = () => recent.clear();

/** Guests may chat (FR-45: public tracking page); a token, if sent, must be valid. */
function chatAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  socket.user = null;
  if (!token) return next();
  try {
    const p = verifyAccessToken(token);
    socket.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

/** `/chat` namespace: chat:message in, chat:token / chat:replace / chat:done / chat:error out (FR-49). */
export function initChat(io) {
  const nsp = io.of('/chat');
  nsp.use(chatAuth);
  nsp.on('connection', (socket) => {
    let busy = null; // AbortController of the reply in progress

    socket.on('chat:message', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = chatMessageSchema.safeParse(payload ?? {});
      if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message' });
      const { sessionId, message } = parsed.data;
      const userId = socket.user?.id ?? null;
      if (busy) return reply({ ok: false, error: 'Please wait for the current answer to finish' });
      if (!allowMessage(userId ?? `ip:${socket.handshake.address}`)) return reply({ ok: false, error: 'You’re sending messages too quickly. Try again in a minute.' });

      try {
        await assertSessionOwner(sessionId, userId);
      } catch (err) {
        return reply({ ok: false, error: err.message });
      }
      busy = new AbortController();
      const controller = busy;
      try {
        const previous = await ChatMessage.find({ sessionId }).sort({ createdAt: -1, _id: -1 }).limit(10).select('role content').lean();
        const userMsg = await ChatMessage.create({ userId, sessionId, role: 'user', content: message });
        reply({ ok: true, messageId: userMsg._id.toString() });

        let answer = '';
        let done = null;
        await streamChat(
          { message, history: previous.reverse().map((m) => ({ role: m.role, content: m.content })), userId },
          (e) => {
            if (e.type === 'token') {
              answer += e.text;
              socket.emit('chat:token', { sessionId, token: e.text });
            } else if (e.type === 'replace') {
              answer = e.text;
              socket.emit('chat:replace', { sessionId, text: e.text });
            } else if (e.type === 'done') {
              done = e;
            }
          },
          controller.signal,
        );
        if (!answer.trim()) throw new Error('empty answer');
        const saved = await ChatMessage.create({
          userId,
          sessionId,
          role: 'assistant',
          content: answer.trim(),
          sources: done?.sources ?? [],
          intent: done?.intent ?? null,
          confident: done?.confident ?? null,
        });
        socket.emit('chat:done', {
          sessionId,
          messageId: saved._id.toString(),
          sources: saved.sources,
          confident: saved.confident,
          intent: saved.intent,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          logger.warn(`chat failed: ${err.message}`);
          socket.emit('chat:error', { sessionId, error: UNAVAILABLE });
        }
      } finally {
        busy = null;
      }
    });

    socket.on('disconnect', () => busy?.abort());
  });
  return nsp;
}
