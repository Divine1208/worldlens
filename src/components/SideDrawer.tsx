import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { findConcept } from '../data/concepts';
import { askStory, explainConcept, hasAI } from '../ai/router';
import { Badge, Btn, Inset, cx } from './ui';
import { sanitizeGenZ } from '../lib/genz';

const PILLS = ['Explain like I’m 17', 'Who benefits most?', 'How does this affect startups?', 'Any business opportunity here?'];

export function SideDrawer() {
  const { drawer, closeDrawer, openDrawer } = useApp();
  useEffect(() => {
    if (!drawer.open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [drawer.open, closeDrawer]);
  return (
    <>
      <div className={cx('fixed inset-0 z-40 bg-slate-950/50 transition-opacity', drawer.open ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={closeDrawer} />
      <aside
        className={cx(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900',
          drawer.open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!drawer.open}
        aria-label="Research drawer"
      >
        <div className="flex items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-800">
          {(['term', 'chat'] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => openDrawer({ ...drawer, tab: tb })}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-bold', drawer.tab === tb ? 'bg-indigo-600 text-white' : 'text-slate-500')}
            >
              {tb === 'term' ? '📖 Term Decoder' : '✦ Story AI Research Chat'}
            </button>
          ))}
          <Btn className="ml-auto" onClick={closeDrawer} aria-label="Close drawer">✕</Btn>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{drawer.open && (drawer.tab === 'term' ? <TermPanel /> : <ChatPanel />)}</div>
      </aside>
    </>
  );
}

function TermPanel() {
  const { drawer, openDrawer, learnConcept, vault, stories, user } = useApp();
  const c = drawer.term ? findConcept(drawer.term) : undefined;
  const story = stories.find((s) => s.id === drawer.storyId);
  const [ex, setEx] = useState<{ text: string; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    setEx(null);
    setErr('');
    if (c) learnConcept(c.term);
  }, [c?.term]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c)
    return (
      <div className="text-sm text-slate-500">
        {drawer.term ? `“${drawer.term}” isn’t in the built-in decoder yet — ask the AI tab.` : 'Tap any dotted-underlined term to decode it.'}
      </div>
    );
  const inNews = stories.filter((s) => s.concepts.includes(c.term)).slice(0, 4);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-xl font-extrabold">{c.term}</h3>
        {user.learnedConcepts[c.term] && <Badge tone="emerald">In your knowledge graph</Badge>}
      </div>
      <Block title="What is it? (plain English)">{sanitizeGenZ(c.simple)}</Block>
      <Block title="17yo everyday analogy" tone="amber">{c.analogy}</Block>
      {user.tone === 'analyst' && <Block title="Analyst definition">{c.advanced}</Block>}
      <Block title="Why it matters">{c.whyItMatters}</Block>
      {(story || inNews.length > 0) && (
        <Block title="In this news">
          <ul className="list-disc space-y-1 pl-4">
            {(story ? [story] : inNews).map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ul>
        </Block>
      )}
      {c.related.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Related terms</div>
          <div className="flex flex-wrap gap-1.5">
            {c.related.map((r) => (
              <button key={r} onClick={() => openDrawer({ tab: 'term', term: r, storyId: drawer.storyId })} className="rounded-full border border-sky-500/40 px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      <Btn
        variant="outline"
        disabled={busy || !hasAI(vault)}
        title={!hasAI(vault) ? 'Add an AI key in the Vault' : ''}
        onClick={async () => {
          setBusy(true);
          try {
            setEx(await explainConcept(vault, c.term, story?.title));
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Thinking…' : 'Ask AI for an Indian business example →'}
      </Btn>
      {err && <p className="text-xs text-rose-500">{err}</p>}
      {ex && (
        <Inset className="p-3">
          <p>{ex.text}</p>
          <p className="mt-1 text-[11px] text-slate-500">Answered by {ex.provider}</p>
        </Inset>
      )}
    </div>
  );
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'amber' }) {
  return (
    <div className={cx('rounded-xl border p-3', tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-200 dark:border-slate-800')}>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function ChatPanel() {
  const { drawer, stories, vault, user, setUser, setModal } = useApp();
  const story = stories.find((s) => s.id === drawer.storyId) ?? null;
  const [msgs, setMsgs] = useState<{ q: string; a: string; provider: string; note?: string }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setMsgs([]), [drawer.storyId]);
  useEffect(() => end.current?.scrollIntoView?.({ behavior: 'smooth' }), [msgs, busy]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setQ('');
    setBusy(true);
    try {
      const r = await askStory(vault, story, question, msgs, user.tone);
      setMsgs((m) => [...m, { q: question, a: r.answer, provider: r.provider, note: r.ensembleNote }]);
      setUser((u) => ({ ...u, questions: [{ at: new Date().toISOString(), storyId: story?.id, q: question, a: r.answer, provider: r.provider }, ...u.questions].slice(0, 200) }));
    } catch (e) {
      setMsgs((m) => [...m, { q: question, a: `⚠ ${(e as Error).message}`, provider: 'error' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <Inset className="p-2.5 text-xs">
        <div className="font-bold uppercase tracking-wider text-slate-400">Context</div>
        {story ? story.title : 'No story selected — general research mode.'}
      </Inset>
      {!hasAI(vault) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          No AI provider yet. Add a free Gemini, Groq or OpenRouter key.{' '}
          <button className="font-bold underline" onClick={() => setModal('vault')}>Open Vault</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PILLS.map((p) => (
          <button key={p} disabled={busy || !hasAI(vault)} onClick={() => ask(p)} className="rounded-full border border-sky-500/40 px-2.5 py-1 text-xs font-semibold text-sky-700 disabled:opacity-40 dark:text-sky-300">
            {p}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className="ml-8 rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-white">{m.q}</div>
            <div className="mr-4 whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-200 px-3 py-2 dark:border-slate-800">
              {m.a}
              <div className="mt-1.5 text-[10.5px] text-slate-500">Answered by {m.provider}</div>
              {m.note && <div className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-300">{m.note}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="animate-pulse text-xs text-sky-500">Searching live web + thinking…</div>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="sticky bottom-0 flex gap-2 bg-white pt-2 dark:bg-slate-900"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a follow-up…" className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" aria-label="Ask a question" />
        <Btn variant="primary" disabled={busy || !hasAI(vault)}>Ask</Btn>
      </form>
    </div>
  );
}
