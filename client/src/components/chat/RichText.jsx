import { Fragment } from 'react';

// Renders the assistant's small formatting vocabulary — **bold**, "- " lists, [n] citations —
// as React elements (never as HTML), so model output can't inject markup.

function inline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={key} className="font-semibold">{p.slice(2, -2)}</strong>;
    const cite = /^\[(\d+)\]$/.exec(p);
    if (cite) return <sup key={key} className="ml-0.5 rounded bg-primary/15 px-1 font-mono text-[10px] font-semibold text-primary-text" aria-label={`source ${cite[1]}`}>{cite[1]}</sup>;
    return <Fragment key={key}>{p}</Fragment>;
  });
}

export function RichText({ text }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const item = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (item) {
      if (!list) blocks.push((list = { type: 'ul', items: [], key: i }));
      list.items.push({ text: item[1], key: i });
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: 'p', text: line, key: i });
    }
  });
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b) =>
        b.type === 'ul' ? (
          <ul key={b.key} className="list-disc space-y-1 pl-4">
            {b.items.map((it) => <li key={it.key}>{inline(it.text, it.key)}</li>)}
          </ul>
        ) : (
          <p key={b.key}>{inline(b.text, b.key)}</p>
        ),
      )}
    </div>
  );
}
