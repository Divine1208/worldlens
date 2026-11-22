import type { NewsStory } from '../types';
import { useApp } from '../store/AppContext';
import { Badge, Btn, Card, Inset, cx } from './ui';
import { formatDateTime } from '../lib/time';
import { ConceptText } from './ConceptText';
import { CATEGORY_META } from '../lib/copy';

const STATUS_TONE = { NEW: 'sky', UPDATED: 'indigo', DEVELOPING: 'amber', ONGOING: 'slate' } as const;

export function OriginBadge({ s }: { s: NewsStory }) {
  return s.origin === 'LIVE_WEB' ? (
    <Badge tone="emerald">🟢 Live web</Badge>
  ) : s.origin === 'ARCHIVE_RECORD' ? (
    <Badge tone="amber">📁 Archive record</Badge>
  ) : (
    <Badge tone="rose">Demo data</Badge>
  );
}

export function TimestampReceipt({ s, cols = 2 }: { s: NewsStory; cols?: 2 | 4 }) {
  const { user } = useApp();
  const tz = user.timezone;
  const firstSeen = s.sources.every((x) => x.timestampKind === 'first-seen');
  const cells = [
    [firstSeen ? 'First seen online' : 'Published', formatDateTime(s.publishedAt, tz)],
    ['Last updated / verified', formatDateTime(s.updatedAt, tz)],
    ['Collected by app', formatDateTime(s.collectedAt, tz)],
    ['Event date', `${s.eventDate ? formatDateTime(s.eventDate, tz).split(',')[0] : 'Same as publication (not separately stated)'} • ${s.sources.length} source${s.sources.length > 1 ? 's' : ''}`],
  ];
  return (
    <Inset className={cx('grid gap-x-3 gap-y-1.5 px-3 py-2', cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2')}>
      {cells.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">{k}</div>
          <div className="truncate font-mono text-[11.5px] tabular-nums text-slate-700 dark:text-slate-300" title={v}>
            {v}
          </div>
        </div>
      ))}
    </Inset>
  );
}

export function StoryCard({ s }: { s: NewsStory }) {
  const { user, setRead, toggleSaveStory, go, openDrawer } = useApp();
  const read = !!user.readMap[s.id];
  const saved = user.savedStories.includes(s.id);
  const framed = !!user.framings[s.id];
  const open = () => go({ name: 'story', id: s.id });
  const primary = [...s.sources].sort((a, b) => a.credibilityTier - b.credibilityTier)[0];
  return (
    <Card className={cx('flex flex-col gap-2.5 p-4 transition hover:border-sky-500/40', read && 'opacity-75')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={read ? 'slate' : 'sky'} onClick={() => setRead(s.id, !read)} title="Toggle read state">
          {read ? '✓ Read' : '● Unread'}
        </Badge>
        <OriginBadge s={s} />
        <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
        <Badge tone="indigo">
          {CATEGORY_META[s.category].emoji} {CATEGORY_META[s.category].label}
        </Badge>
        {s.confidence === 'VERIFIED' && <Badge tone="emerald">Verified</Badge>}
        {s.sources.every((x) => x.sourceType === 'community') && <Badge tone="rose">Discovery signal only</Badge>}
        {framed && <Badge tone="purple">✎ Framed in my words</Badge>}
        <Badge tone="amber" className="ml-auto" title="Heuristic: sources × credibility × signal words × recency">
          Impact {s.importance}/100
        </Badge>
      </div>
      <TimestampReceipt s={s} />
      <div>
        <button onClick={open} className="text-left text-[15.5px] font-extrabold leading-snug hover:text-sky-600 dark:hover:text-sky-300">
          {s.title}
        </button>
        {s.summary && (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <ConceptText text={s.summary} storyId={s.id} />
          </p>
        )}
        {!s.summary && s.concepts.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Key terms: <ConceptText text={s.concepts.join(', ')} storyId={s.id} />
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {primary.publisher}
          {s.sources.length > 1 && ` + ${s.sources.length - 1} more source${s.sources.length > 2 ? 's' : ''} clustered`}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-200 pt-2.5 dark:border-slate-800">
        <Btn variant="primary" className="text-xs" onClick={open}>
          Full Deep Dive
        </Btn>
        <Btn variant="outline" className="text-xs" onClick={() => openDrawer({ tab: 'chat', storyId: s.id })}>
          ✦ Ask AI
        </Btn>
        <a href={primary.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          Source ↗
        </a>
        <Btn className="text-xs" onClick={() => setRead(s.id, !read)}>
          {read ? 'Mark unread' : 'Mark read'}
        </Btn>
        <Btn className="text-xs" onClick={() => toggleSaveStory(s.id)}>
          {saved ? '🔖 Saved' : 'Save'}
        </Btn>
      </div>
    </Card>
  );
}
