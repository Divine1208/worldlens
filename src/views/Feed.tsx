import { useMemo, useState } from 'react';
import type { Category, NewsStory } from '../types';
import { useApp } from '../store/AppContext';
import { archiveDates, bucketByHour, rankFlat } from '../lib/lifecycle';
import { formatDateOnly, formatDateTime, hourLabel, relativeAgo, tzShort } from '../lib/time';
import { StoryCard } from '../components/StoryCard';
import { Badge, Btn, Card, Empty, Inset, cx } from '../components/ui';
import { t, CATEGORY_META } from '../lib/copy';
import { CONCEPT_INDEX } from '../data/concepts';

type Mode = 'hourly' | 'flat' | 'archive';
type ReadFilter = 'all' | 'unread' | 'read';

function matches(s: NewsStory, q: string) {
  if (!q) return true;
  const hay = (s.title + ' ' + s.summary + ' ' + s.sources.map((x) => x.publisher + ' ' + x.title).join(' ') + ' ' + s.concepts.join(' ')).toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function Feed({ category }: { category?: Category }) {
  const app = useApp();
  const { todayStories, archive, user, now, cycle, lastPolled, polling, log, search, markManyRead, health, loaded } = app;
  const tz = user.timezone;
  const [mode, setMode] = useState<Mode>('hourly');
  const [rf, setRf] = useState<ReadFilter>('all');
  const dates = useMemo(() => archiveDates(archive), [archive]);
  const [archDate, setArchDate] = useState<string>('');
  const activeArchDate = archDate || dates[0] || '';

  const base = (mode === 'archive' ? archive.filter((s) => s.dateKeyIST === activeArchDate) : todayStories)
    .filter((s) => !category || s.category === category)
    .filter((s) => matches(s, search));
  const readCount = base.filter((s) => user.readMap[s.id]).length;
  const visible = base.filter((s) => (rf === 'all' ? true : rf === 'read' ? !!user.readMap[s.id] : !user.readMap[s.id]));
  const buckets = mode === 'hourly' ? bucketByHour(visible, now, tz) : [];
  const healthy = health.filter((h) => h.status === 'HEALTHY').length;
  const degraded = health.filter((h) => h.status === 'DEGRADED').length;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-600/10 via-sky-500/5 to-transparent p-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              {category ? `${CATEGORY_META[category].emoji} ${CATEGORY_META[category].label}` : '🏠 Today’s Intelligence'}
            </h1>
            <p className="font-mono text-xs text-slate-500">
              Cycle {cycle} ({formatDateOnly(cycle, tz)}) • Last polled {lastPolled ? `${formatDateTime(lastPolled, tz)} (${relativeAgo(lastPolled, now)})` : 'never'}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {todayStories.length} verified-timestamp stories today across {healthy} healthy source adapters
              {degraded ? `, ${degraded} degraded` : ''}. {archive.length} stories kept in the Historical Archive.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800/70">
            {(
              [
                ['hourly', '🕒 Today’s Hourly Feed'],
                ['flat', '📰 Today’s Flat Stream'],
                ['archive', '📁 Historical Archive'],
              ] as [Mode, string][]
            ).map(([m, l]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-bold',
                  mode === m ? (m === 'archive' ? 'bg-amber-500 text-slate-950' : 'bg-indigo-600 text-white') : 'text-slate-600 dark:text-slate-300',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2 dark:border-slate-800">
          {(['all', 'unread', 'read'] as ReadFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setRf(f)}
              className={cx('rounded-full px-3 py-1 text-xs font-semibold', rf === f ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'text-slate-500')}
            >
              {f === 'all' ? `All (${base.length})` : f === 'unread' ? `Unread (${base.length - readCount})` : `Read (${readCount})`}
            </button>
          ))}
          <Btn className="ml-auto text-xs" onClick={() => markManyRead(visible.map((s) => s.id))} disabled={!visible.length}>
            ✓ Mark visible read
          </Btn>
          {mode === 'archive' && (
            <select
              value={activeArchDate}
              onChange={(e) => setArchDate(e.target.value)}
              className="rounded-lg border border-amber-500/40 bg-transparent px-2 py-1 text-xs dark:bg-slate-900"
              aria-label="Archive date"
            >
              {dates.length === 0 && <option value="">No archived days yet</option>}
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDateOnly(d, tz)} ({archive.filter((s) => s.dateKeyIST === d).length})
                </option>
              ))}
            </select>
          )}
        </div>
        {polling && (
          <Inset className="mx-4 mb-3 max-h-40 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed" data-testid="ingest-log">
            <LogLines />
            <div className="animate-pulse text-sky-500">polling adapters…</div>
          </Inset>
        )}
        {!polling && log.length > 0 && (
          <details className="mx-4 mb-3 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">Ingestion log — {log[log.length - 1].msg}</summary>
            <Inset className="mt-1 max-h-48 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
              <LogLines />
            </Inset>
          </details>
        )}
      </Card>

      {app.rolloverNotice && <Card className="border-amber-500/40 p-3 text-sm text-amber-700 dark:text-amber-300">🌙 {app.rolloverNotice}</Card>}

      {loaded && !polling && todayStories.length === 0 && mode !== 'archive' && (
        <Empty>
          No live stories collected yet for this cycle. Hit <b>Poll Live News Now</b>. If every adapter shows DEGRADED in Sources, your network or a
          browser extension is blocking the feeds — run the app with <code>npm run dev</code> (it ships its own news proxy) or add a Guardian /
          NewsData key in the Vault. WorldLens will not show placeholder stories.
        </Empty>
      )}

      {mode === 'hourly' &&
        buckets.map((b) => (
          <section key={b.hour} aria-label={`Hour ${b.hour}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-sky-300 dark:bg-slate-800">
                {hourLabel(b.hour)} {tzShort(tz)}
              </span>
              <span className="text-xs text-slate-500">
                {b.stories.length} verified {b.stories.length === 1 ? 'story' : 'stories'} • Cycle {cycle}
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            {b.stories.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {b.stories.map((s) => (
                  <StoryCard key={s.id} s={s} />
                ))}
              </div>
            ) : (
              <p className="pl-1 text-xs italic text-slate-400">{t('quiet', user.tone)}</p>
            )}
          </section>
        ))}

      {mode !== 'hourly' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {(mode === 'flat' ? rankFlat(visible) : [...visible].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))).map((s) => (
            <StoryCard key={s.id} s={s} />
          ))}
          {visible.length === 0 && <Empty>{mode === 'archive' ? 'Nothing archived for this date/filter yet. Archives build up automatically after each midnight rollover.' : 'No stories match these filters.'}</Empty>}
        </div>
      )}

      {!category && mode !== 'archive' && <BottomModules stories={todayStories} />}
    </div>
  );
}

function LogLines() {
  const { log, user } = useApp();
  return (
    <>
      {log.map((l, i) => (
        <div key={i} className={l.level === 'error' ? 'text-rose-500' : l.level === 'warn' ? 'text-amber-500' : 'text-slate-500'}>
          [{new Date(l.at).toLocaleTimeString('en-IN', { timeZone: user.timezone, hour12: false })}] {l.msg}
        </div>
      ))}
    </>
  );
}

function BottomModules({ stories }: { stories: NewsStory[] }) {
  const { openDrawer, go, user } = useApp();
  // Early signals: official/primary releases not yet widely covered, or fast-rising discovery posts. Never predictions.
  const signals = stories
    .filter((s) => (s.sources.length === 1 && s.sources[0].credibilityTier <= 2) || (s.sources[0].adapter === 'hn' && s.importance >= 30))
    .slice(0, 8);
  const freq = new Map<string, number>();
  stories.forEach((s) => s.concepts.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + 1)));
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const trends = top.filter(([, n]) => n >= 3);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="mb-1 font-extrabold">🔭 Early Signals</h3>
        <p className="mb-2 text-xs text-slate-500">Primary releases that only one source has carried so far, plus fast-rising tech discussion. These are signals, not predictions.</p>
        <div className="space-y-1.5">
          {signals.map((s) => (
            <button key={s.id} onClick={() => go({ name: 'story', id: s.id })} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              <Badge tone="amber">Early signal</Badge>
              <span className="line-clamp-2">
                {s.title} <span className="text-xs text-slate-500">— {s.sources[0].publisher}</span>
              </span>
            </button>
          ))}
          {!signals.length && <p className="text-xs italic text-slate-400">No early signals in today’s verified data yet.</p>}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="mb-1 font-extrabold">🧠 Today’s Learning</h3>
        <p className="mb-2 text-xs text-slate-500">Core concepts showing up in today’s stories. Tap to decode.</p>
        <div className="flex flex-wrap gap-1.5">
          {top.map(([c, n]) => (
            <button
              key={c}
              onClick={() => openDrawer({ tab: 'term', term: c })}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs font-semibold',
                user.learnedConcepts[c] ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-300' : 'border-sky-500/40 text-sky-700 dark:text-sky-300',
              )}
            >
              {c} <span className="opacity-60">×{n}</span>
            </button>
          ))}
          {!top.length && <p className="text-xs italic text-slate-400">Concepts appear after the first poll.</p>}
        </div>
        {trends.length > 0 && (
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            <b>Multi-story trends:</b>{' '}
            {trends.map(([c, n]) => `${c} appears in ${n} separate stories`).join(' · ')}
            {trends.some(([c]) => CONCEPT_INDEX.get(c.toLowerCase())?.related.length) && ' — open a term to see how they connect.'}
          </div>
        )}
      </Card>
    </div>
  );
}
