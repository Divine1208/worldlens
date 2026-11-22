import { useEffect, useState } from 'react';
import { BRAND } from '../config';
import { useApp } from '../store/AppContext';
import { formatClock, tzShort, dateKey } from '../lib/time';
import { Btn, Spinner, cx } from './ui';
import { hasAI } from '../ai/router';
import { activeOpportunities } from '../lib/opportunities';

function LiveClock() {
  const { user } = useApp();
  const [n, setN] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setN(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums" data-testid="live-clock">
      {tzShort(user.timezone)} Clock: {formatClock(n, user.timezone)} • Cycle: {dateKey(n, user.timezone)}
    </div>
  );
}

export function Header() {
  const { user, setUser, vault, poll, polling, setModal, search, setSearch, health, go } = useApp();
  const keys = ['gemini', 'groq', 'openrouter', 'tavily', 'serper', 'newsdata', 'guardian'].filter((k) => (vault as unknown as Record<string, unknown>)[k]).length;
  const degraded = health.filter((h) => h.status === 'DEGRADED').length;
  return (
    <header className="z-30 sm:sticky sm:top-0 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-3 py-2.5 sm:px-5">
        <button className="flex items-center gap-2.5 text-left" onClick={() => go({ name: 'today' })}>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-lg shadow-md shadow-indigo-900/40">🌐</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-extrabold tracking-tight">{BRAND.name}</span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                {hasAI(vault) ? 'Live AI + Web' : `Real-time ${tzShort(user.timezone)} engine`}
              </span>
            </div>
            <LiveClock />
          </div>
        </button>

        <div className="order-3 w-full flex-1 sm:order-none sm:w-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search India, RBI, AI, tariffs, AI filmmaking grants…"
            aria-label="Global search"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setUser((u) => ({ ...u, tone: u.tone === 'genz' ? 'analyst' : 'genz' }))}
            className={cx(
              'rounded-full border px-3 py-1.5 text-xs font-bold',
              user.tone === 'genz'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-slate-400/50 bg-slate-500/10 text-slate-700 dark:text-slate-200',
            )}
            title="Toggle plain-English vs analyst mode"
          >
            {user.tone === 'genz' ? '✦ 17yo Plain English' : '▤ Analyst Mode'}
          </button>
          <Btn variant="primary" onClick={poll} disabled={polling}>
            <Spinner spinning={polling} /> {polling ? 'Polling…' : 'Poll Live News Now'}
          </Btn>
          <Btn variant="outline" onClick={() => setModal('health')} title="Source health">
            <span className={degraded ? 'text-rose-500' : 'text-emerald-500'}>●</span> Sources
          </Btn>
          <Btn variant="outline" onClick={() => setModal('vault')} title="API Vault">
            🔐 Vault <span className="rounded bg-indigo-500/15 px-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{keys}</span>
          </Btn>
          <Btn variant="outline" onClick={() => setUser((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' }))} aria-label="Toggle theme">
            {user.theme === 'dark' ? '☀' : '☾'}
          </Btn>
        </div>
      </div>
      <NavStrip />
    </header>
  );
}

function NavStrip() {
  const { view, go, todayStories, user, allOpps, now, stories } = useApp();
  const unread = stories.filter((s) => !user.readMap[s.id]).length;
  const items: { key: string; label: string; count?: number; onClick: () => void; active: boolean }[] = [
    { key: 'today', label: '🏠 Today’s Intelligence', count: todayStories.length, onClick: () => go({ name: 'today' }), active: view.name === 'today' },
    ...(['india', 'world', 'markets', 'ai-tech', 'startups'] as const).map((c) => ({
      key: c,
      label: { india: '🇮🇳 India', world: '🌍 World', markets: '📈 Markets & Economy', 'ai-tech': '🤖 AI & Tech', startups: '🚀 Startups' }[c],
      count: todayStories.filter((s) => s.category === c).length,
      onClick: () => go({ name: 'category', cat: c }),
      active: view.name === 'category' && view.cat === c,
    })),
    { key: 'gaps', label: '💡 Market Gaps', onClick: () => go({ name: 'gaps' }), active: view.name === 'gaps' },
    { key: 'opps', label: '🎯 Global Opportunity Engine', count: activeOpportunities(allOpps, now).length, onClick: () => go({ name: 'opps' }), active: view.name === 'opps' },
    { key: 'saved', label: '🔖 Saved', count: user.savedStories.length + user.savedOpps.length, onClick: () => go({ name: 'saved' }), active: view.name === 'saved' },
    { key: 'knowledge', label: '🧠 My Knowledge & Tracker', count: unread, onClick: () => go({ name: 'knowledge' }), active: view.name === 'knowledge' },
  ];
  return (
    <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-3 pb-2 sm:px-5" aria-label="Primary">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={i.onClick}
          className={cx(
            'shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition',
            i.active ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          {i.label}
          {i.count !== undefined && <span className={cx('ml-1.5 rounded-md px-1.5 text-[11px] tabular-nums', i.active ? 'bg-white/20' : 'bg-slate-500/15')}>{i.count}</span>}
        </button>
      ))}
    </nav>
  );
}
