import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Files, Inbox, Loader2, MessageSquareText, RefreshCw, ThumbsUp, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useSocket } from '@/context/SocketContext';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const ACCEPT = '.pdf,.md,.markdown,.txt';
const MAX_MB = 10;
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const DOC_STATUS = {
  processing: { label: 'Processing', icon: Loader2, className: 'text-amber-700 bg-amber-500/10 dark:text-amber-300', spin: true },
  ready: { label: 'Ready', icon: CheckCircle2, className: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
  failed: { label: 'Failed', icon: AlertTriangle, className: 'text-red-700 bg-red-500/10 dark:text-red-300' },
};

function DocStatus({ status }) {
  const s = DOC_STATUS[status];
  return (
    <Badge className={s.className}>
      <s.icon className={cn('h-3 w-3', s.spin && 'animate-spin')} aria-hidden /> {s.label}
    </Badge>
  );
}

/** FR-35: the chatbot's knowledge base, plus its feedback (FR-52) and support tickets (FR-50). */
export default function AdminDocuments() {
  const [docs, setDocs] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const socket = useSocket();

  const loadDocs = useCallback(() => api.get('/admin/documents').then(({ data }) => setDocs(data.documents)), []);
  const loadOverview = useCallback(() => api.get('/admin/chat/overview').then(({ data }) => setOverview(data)).catch(() => {}), []);
  useEffect(() => {
    loadDocs().catch((e) => setError(parseApiError(e).message));
    loadOverview();
  }, [loadDocs, loadOverview]);

  // Live ingestion progress (`document:status`), with a slow poll as a safety net.
  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = (e) => {
      setDocs((list) => list?.map((d) => (d.id === e.documentId ? { ...d, ...e, id: d.id } : d)));
      if (e.status === 'ready') loadOverview();
    };
    socket.on('document:status', onStatus);
    return () => socket.off('document:status', onStatus);
  }, [socket, loadOverview]);
  const processing = docs?.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!processing) return undefined;
    const id = setInterval(() => loadDocs().catch(() => {}), 8000);
    return () => clearInterval(id);
  }, [processing, loadDocs]);

  const reindex = async (d) => {
    try {
      const { data } = await api.post(`/admin/documents/${d.id}/reindex`);
      setDocs((list) => list.map((x) => (x.id === d.id ? data.document : x)));
    } catch (err) {
      toast.error(parseApiError(err).message);
    }
  };
  const remove = async () => {
    const d = toDelete;
    try {
      await api.delete(`/admin/documents/${d.id}`);
      setDocs((list) => list.filter((x) => x.id !== d.id));
      toast.success(`“${d.title}” removed — the assistant no longer uses it`);
      loadOverview();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setToDelete(null);
    }
  };

  if (error) return <EmptyState title="Couldn’t load documents" text={error} />;
  const ready = docs?.filter((d) => d.status === 'ready') ?? [];
  const rated = overview ? overview.ratings.up + overview.ratings.down : 0;
  const openTickets = overview?.tickets.filter((t) => t.status === 'open').length ?? 0;

  return (
    <>
      <PageHeader title="Chatbot documents" subtitle="The assistant answers policy questions only from these documents, and cites them." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Documents in use" value={docs ? `${ready.length}/${docs.length}` : '—'} icon={Files} note={processing ? 'Indexing…' : 'Ready to answer from'} />
        <KpiCard label="Passages indexed" value={docs ? ready.reduce((n, d) => n + d.chunkCount, 0) : '—'} icon={FileText} note="~500-token chunks searched per question" />
        <KpiCard label="Helpful answers" value={rated ? `${Math.round((overview.ratings.up / rated) * 100)}%` : '—'} icon={ThumbsUp} note={rated ? `${overview.ratings.up} 👍 · ${overview.ratings.down} 👎, last 30 days` : 'No ratings yet'} />
        <KpiCard label="Open tickets" value={overview ? openTickets : '—'} icon={Inbox} note="Raised when the bot wasn’t sure" />
      </div>
      {overview && <AssistantNote a={overview.assistant} />}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="docs-title" className="min-w-0 rounded-card border border-border bg-surface shadow-soft">
          <div className="border-b border-border p-5">
            <h2 id="docs-title" className="font-bold">Knowledge base</h2>
          </div>
          {!docs ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : docs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No documents yet. Upload your policies so the assistant can answer from them.</p>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-text sm:grid"><FileText className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.title}</p>
                    <p className="truncate text-xs text-muted">
                      {d.filename} · {kb(d.size)} · added {formatDate(d.createdAt)}
                      {d.status === 'ready' && ` · ${d.chunkCount} passage${d.chunkCount === 1 ? '' : 's'}${d.pages > 1 ? ` from ${d.pages} pages` : ''}`}
                    </p>
                    {d.status === 'failed' && d.error && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{d.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <DocStatus status={d.status} />
                    {d.status === 'failed' && <Button variant="ghost" size="sm" onClick={() => reindex(d)}><RefreshCw /> Retry</Button>}
                    <Button asChild variant="ghost" size="icon" className="h-9 w-9" aria-label={`Open ${d.title}`}>
                      <a href={d.fileUrl} target="_blank" rel="noreferrer"><ExternalLink /></a>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted hover:text-red-600" aria-label={`Delete ${d.title}`} onClick={() => setToDelete(d)} disabled={d.status === 'processing'}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Uploader onUploaded={(doc) => setDocs((list) => [doc, ...(list ?? [])])} />
      </div>

      {overview && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Tickets tickets={overview.tickets} onChange={loadOverview} />
          <section aria-labelledby="down-title" className="min-w-0 rounded-card border border-border bg-surface p-5 shadow-soft">
            <h2 id="down-title" className="font-bold">Recent 👎 answers</h2>
            <p className="text-xs text-muted">Gaps here usually mean a policy is missing or unclear.</p>
            {overview.recentDown.length === 0 ? (
              <p className="mt-6 text-center text-sm text-muted">No unhelpful ratings yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {overview.recentDown.map((r) => (
                  <li key={r.id} className="rounded-xl bg-background p-3 text-sm">
                    {r.question && <p className="font-semibold">“{r.question}”</p>}
                    <p className="mt-1 line-clamp-3 text-muted">{r.answer}</p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(r.ratedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogTitle>Delete “{toDelete?.title}”?</DialogTitle>
          <DialogDescription>The assistant will stop answering from this document straight away. Past chat answers keep their citations.</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button className="bg-red-600 text-white shadow-none hover:bg-red-700" onClick={remove}><Trash2 /> Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssistantNote({ a }) {
  if (!a) return <p className="mt-3 text-xs text-muted">The AI service is offline — uploads will fail and the chat is unavailable until it’s back.</p>;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
      <MessageSquareText className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {a.llm ? <>Answers are written by <span className="font-mono">{a.model}</span> from the retrieved passages.</> : <>No LLM key set — the assistant replies by quoting the best-matching passages. Add <span className="font-mono">LLM_API_KEY</span> to the AI service for written answers.</>}{' '}
        Search: <span className="font-mono">{a.embedder}</span> embeddings, {a.vectorSearch === 'atlas' ? 'Atlas Vector Search' : 'in-service cosine search'}.
      </span>
    </p>
  );
}

function Uploader({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);

  const pick = (f) => {
    setError('');
    if (!f) return;
    if (!/\.(pdf|md|markdown|txt)$/i.test(f.name)) return setError('Choose a PDF, Markdown (.md) or text (.txt) file');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`Files must be under ${MAX_MB} MB`);
    setFile(f);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a file to upload');
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      if (title.trim()) form.set('title', title.trim());
      const { data } = await api.post('/admin/documents', form);
      onUploaded(data.document);
      toast.success('Uploaded — indexing now');
      setFile(null);
      setTitle('');
      if (input.current) input.current.value = '';
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="h-fit rounded-card border border-border bg-surface p-5 shadow-soft" aria-labelledby="upload-title">
      <h2 id="upload-title" className="font-bold">Upload a document</h2>
      <label
        htmlFor="doc-file"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={cn('mt-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:border-primary', drag ? 'border-primary bg-primary/5' : 'border-border hover:border-ink/30')}
      >
        <UploadCloud className="h-8 w-8 text-muted" aria-hidden />
        <span className="mt-2 text-sm font-semibold">{file ? file.name : 'Drop a file or browse'}</span>
        <span className="mt-0.5 text-xs text-muted">{file ? kb(file.size) : `PDF, Markdown or text · up to ${MAX_MB} MB`}</span>
        <input id="doc-file" ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <label htmlFor="doc-title" className="mt-4 block text-sm font-medium">Title <span className="font-normal text-muted">(optional)</span></label>
      <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Refund policy"
        className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-sm outline-none placeholder:text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" />
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <Button type="submit" className="mt-4 w-full" disabled={busy || !file}>{busy ? <Loader2 className="animate-spin" /> : <UploadCloud />} Upload and index</Button>
      <p className="mt-3 text-xs text-muted">Scanned PDFs need OCR first: the assistant can only read text. Headings help it cite the right section.</p>
    </form>
  );
}

function Tickets({ tickets, onChange }) {
  const [busy, setBusy] = useState(null);
  const toggle = async (t) => {
    setBusy(t.id);
    try {
      await api.patch(`/admin/tickets/${t.id}`, { status: t.status === 'open' ? 'resolved' : 'open' });
      await onChange();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="tickets-title" className="min-w-0 rounded-card border border-border bg-surface p-5 shadow-soft">
      <h2 id="tickets-title" className="font-bold">Support tickets</h2>
      <p className="text-xs text-muted">Questions the assistant couldn’t answer. Reply by email, then mark them resolved.</p>
      {tickets.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">No tickets yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', t.status === 'resolved' && 'text-muted line-through decoration-muted/50')}>{t.question}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {t.name ? `${t.name} · ` : ''}<a className="underline-offset-2 hover:underline" href={`mailto:${t.email}`}>{t.email}</a> · {formatDateTime(t.createdAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 self-start" disabled={busy === t.id} onClick={() => toggle(t)}>
                {busy === t.id && <Loader2 className="animate-spin" />}{t.status === 'open' ? 'Mark resolved' : 'Reopen'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
