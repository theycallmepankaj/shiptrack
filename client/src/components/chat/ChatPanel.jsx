import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, FileText, LifeBuoy, Loader2, RotateCcw, SendHorizontal, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { suggestions } from '@/lib/chat';
import { cn } from '@/lib/utils';
import { RichText } from './RichText';
import { useChat } from './useChat';

const MAX = 1000;

/** The chat panel (§11.4): suggested questions, streamed replies, sources, 👍/👎 and support tickets. */
export default function ChatPanel({ onClose, trackingId, launcherRef }) {
  const { user } = useAuth();
  const chat = useChat({ userId: user?.id ?? null });
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    inputRef.current?.focus();
    const launcher = launcherRef?.current;
    return () => launcher?.focus(); // return focus to the button that opened the chat
  }, [launcherRef]);

  // Keep the newest message in view unless the reader has scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  // Screen readers hear each finished reply once, not every streamed word.
  const last = chat.messages.at(-1);
  useEffect(() => {
    if (last?.role === 'assistant' && !last.pending) setAnnounce(last.content);
  }, [last?.role, last?.pending, last?.content]);

  const submit = (text) => {
    if (chat.send(text)) {
      setDraft('');
      stick.current = true;
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };
  const lastQuestion = (index) => chat.messages.slice(0, index).findLast((m) => m.role === 'user')?.content ?? '';

  return (
    <motion.section
      role="dialog"
      aria-label="Chat with the ShipTrack assistant"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      initial={{ opacity: 0, scale: 0.9, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 16 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ transformOrigin: 'bottom right' }}
      className="fixed inset-x-2 bottom-2 top-2 z-[1100] flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lift sm:inset-x-auto sm:bottom-24 sm:right-6 sm:top-auto sm:h-[min(620px,calc(100vh-8rem))] sm:w-[400px]"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <LogoMark className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">ShipTrack assistant</h2>
          <p className="truncate text-xs text-muted">Live tracking · answers from our policies</p>
        </div>
        <button type="button" onClick={chat.reset} disabled={chat.streaming || !chat.messages.length} aria-label="Start a new chat" title="New chat"
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close chat" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {chat.status === 'loading' ? (
          <div className="grid h-full place-items-center text-muted"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading chat" /></div>
        ) : chat.messages.length === 0 ? (
          <Welcome trackingId={trackingId} signedIn={!!user} onPick={submit} />
        ) : (
          chat.messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-background">{m.content}</p>
              </div>
            ) : (
              <AssistantMessage key={m.id} m={m} onRate={chat.rate} sessionId={chat.sessionId} question={lastQuestion(i)} signedIn={!!user} />
            ),
          )
        )}
      </div>

      <div className="border-t border-border p-3">
        {chat.notice && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{chat.notice}</p>}
        <form onSubmit={(e) => { e.preventDefault(); submit(draft); }} className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea id="chat-input" ref={inputRef} rows={1} value={draft} maxLength={MAX} onKeyDown={onKeyDown}
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`; }}
            placeholder="Ask about a parcel or our policies…"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={!draft.trim() || chat.streaming || chat.status !== 'ready'} aria-label="Send message">
            {chat.streaming ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted">The assistant can make mistakes — check your shipment page for exact details.</p>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </motion.section>
  );
}

function Welcome({ trackingId, signedIn, onPick }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-background px-3.5 py-2.5 text-sm">
        Hi! I can track a parcel or answer questions about pricing, packaging, prohibited items, refunds and delivery areas.
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-muted">Try asking</p>
      <div className="flex flex-wrap gap-2">
        {suggestions({ trackingId, signedIn }).map((s) => (
          <button key={s.label} type="button" onClick={() => onPick(s.message)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/10">
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Assistant is typing" role="status">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-muted" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </span>
  );
}

function AssistantMessage({ m, onRate, sessionId, question, signedIn }) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const settled = !m.pending && m.id && !String(m.id).startsWith('local-');
  return (
    <div className="flex flex-col items-start">
      <div className={cn('max-w-[90%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm', m.failed ? 'bg-red-500/10 text-red-800 dark:text-red-200' : 'bg-background')}>
        {m.pending && !m.content ? <Typing /> : <RichText text={m.content} />}
      </div>

      {m.sources?.length > 0 && (
        <ul className="mt-2 flex max-w-[90%] flex-wrap gap-1.5" aria-label="Sources">
          {m.sources.map((s) => (
            <li key={`${s.documentId}-${s.section}-${s.page}`} title={[s.title, s.section, s.page && `page ${s.page}`].filter(Boolean).join(' · ')}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted">
              <span className="font-mono font-semibold text-primary-text">{s.refs?.join(',')}</span>
              <FileText className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{s.title}{s.section && s.section.includes('›') ? ` · ${s.section.split('›').at(-1).trim()}` : ''}{s.page ? ` · p.${s.page}` : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {settled && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {[['up', ThumbsUp, 'Helpful'], ['down', ThumbsDown, 'Not helpful']].map(([value, Icon, label]) => (
            <button key={value} type="button" onClick={() => onRate(m.id, value)} aria-pressed={m.rating === value} aria-label={label} title={label}
              className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-ink/5', m.rating === value ? 'text-primary-text' : 'text-muted')}>
              <Icon className={cn('h-3.5 w-3.5', m.rating === value && 'fill-current')} />
            </button>
          ))}
          {m.confident === false && !ticketOpen && (
            <Button type="button" variant="outline" size="sm" className="ml-1 h-8 rounded-full text-xs" onClick={() => setTicketOpen(true)}>
              <LifeBuoy /> Raise a support ticket
            </Button>
          )}
        </div>
      )}
      {ticketOpen && <TicketForm sessionId={sessionId} messageId={m.id} question={question} signedIn={signedIn} onCancel={() => setTicketOpen(false)} />}
    </div>
  );
}

function TicketForm({ sessionId, messageId, question, signedIn, onCancel }) {
  const [text, setText] = useState(question);
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ saving: false, done: false, error: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ saving: true, done: false, error: '' });
    try {
      await api.post('/chat/tickets', { sessionId, messageId, question: text, ...(signedIn ? {} : { email }) });
      setState({ saving: false, done: true, error: '' });
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setState({ saving: false, done: false, error: fields.email ?? fields.question ?? message });
    }
  };
  if (state.done) {
    return (
      <p className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200" role="status">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Ticket raised — our team will reply by email within one working day.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="mt-2 w-full max-w-[90%] space-y-2 rounded-xl border border-border bg-surface p-3">
      <label htmlFor={`t-q-${messageId}`} className="text-xs font-semibold">What do you need help with?</label>
      <textarea id={`t-q-${messageId}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} required
        className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" />
      {!signedIn && (
        <>
          <label htmlFor={`t-e-${messageId}`} className="text-xs font-semibold">Your email</label>
          <input id={`t-e-${messageId}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" />
        </>
      )}
      {state.error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={state.saving}>{state.saving && <Loader2 className="animate-spin" />} Send ticket</Button>
      </div>
    </form>
  );
}
