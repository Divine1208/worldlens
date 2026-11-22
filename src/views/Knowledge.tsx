import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Badge, Btn, Card, Empty, Inset, SectionTitle, cx } from '../components/ui';
import { CONCEPTS } from '../data/concepts';
import { formatDateTime } from '../lib/time';
import { Countdown, Inspector, StatusBadge, STAGES, OppCard } from './Opportunities';
import { computeStatus } from '../lib/opportunities';
import { StoryCard } from '../components/StoryCard';
import type { GlobalOpportunity, PipelineStage } from '../types';

export function Knowledge() {
  const { user, stories, allOpps, now, go, openDrawer, updateTracker } = useApp();
  const [inspect, setInspect] = useState<GlobalOpportunity | null>(null);
  const [copied, setCopied] = useState('');
  const tz = user.timezone;
  const tracked = allOpps.filter((o) => user.tracker[o.id] || user.savedOpps.includes(o.id));
  const readLog = Object.entries(user.readMap)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id, at]) => ({ s: stories.find((x) => x.id === id), at }))
    .filter((x) => x.s);
  const framings = Object.entries(user.framings).map(([id, f]) => ({ s: stories.find((x) => x.id === id), f, id }));

  const exportJSON = () => {
    const blob = JSON.stringify({ exportedAt: new Date().toISOString(), user, savedStories: stories.filter((s) => user.savedStories.includes(s.id)) }, null, 2);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
      a.download = `worldlens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setCopied('Backup downloaded.');
    } catch {
      navigator.clipboard?.writeText(blob).then(() => setCopied('Download blocked here — backup copied to clipboard instead.'));
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        sub="Everything you’ve read, decoded, framed, asked and tracked — stored on this device."
        right={
          <div className="flex items-center gap-2">
            {copied && <span className="text-xs text-emerald-500">{copied}</span>}
            <Btn variant="outline" onClick={exportJSON}>⬇ Export Intelligence Backup (.json)</Btn>
          </div>
        }
      >
        🧠 My Knowledge Vault & Application CRM
      </SectionTitle>

      <Card className="p-4">
        <h3 className="mb-3 font-extrabold text-purple-700 dark:text-purple-300">Opportunity Application Tracker</h3>
        {tracked.length === 0 && <Empty>Track an opportunity from the Global Opportunity Engine to see it here.</Empty>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[10.5px] uppercase tracking-wider text-slate-400">
              <tr><th className="py-1">Opportunity</th><th>Status</th><th>Deadline</th><th>Checklist</th><th>Stage</th><th /></tr>
            </thead>
            <tbody>
              {tracked.map((o) => {
                const tr = user.tracker[o.id];
                const done = o.submission.filter((x) => tr?.checked[x.id]).length;
                const st = computeStatus(o, now);
                return (
                  <tr key={o.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-2 pr-2 font-semibold">{o.name}{tr?.draftUrl && <a href={tr.draftUrl} target="_blank" rel="noreferrer" className="ml-1 text-xs text-sky-500">draft ↗</a>}</td>
                    <td><StatusBadge s={st} /></td>
                    <td className="pr-2 text-xs">{st === 'CLOSED' ? <span className="text-slate-500">Deadline passed</span> : <Countdown o={o} />}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"><div className="h-full bg-purple-500" style={{ width: `${(done / o.submission.length) * 100}%` }} /></div>
                        <span className="font-mono text-xs">{done}/{o.submission.length} Done</span>
                      </div>
                    </td>
                    <td>
                      <select value={tr?.stage ?? 'Not Started'} onChange={(e) => updateTracker(o.id, { stage: e.target.value as PipelineStage })} className="rounded-lg border border-purple-500/40 bg-transparent px-1.5 py-1 text-xs dark:bg-slate-900" aria-label={`Stage ${o.name}`}>
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><Btn className="text-xs" onClick={() => setInspect(o)}>Checklist & notes</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 font-extrabold">Decoded concepts graph</h3>
          <p className="mb-2 text-xs text-slate-500">{Object.keys(user.learnedConcepts).length} of {CONCEPTS.length} decoded. Green = learned. When these terms show up in new stories, they get a ✓.</p>
          <div className="flex flex-wrap gap-1.5">
            {CONCEPTS.map((c) => (
              <button key={c.term} onClick={() => openDrawer({ tab: 'term', term: c.term })} className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold', user.learnedConcepts[c.term] ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-500 dark:border-slate-700')}>
                {c.term}
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 font-extrabold">Read stories history</h3>
          <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {readLog.map(({ s, at }) => (
              <button key={s!.id} onClick={() => go({ name: 'story', id: s!.id })} className="flex w-full gap-2 rounded p-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{formatDateTime(at, tz)}</span>
                <span className="line-clamp-1">{s!.title}</span>
              </button>
            ))}
            {!readLog.length && <p className="text-xs italic text-slate-400">Nothing read yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-2 font-extrabold text-purple-700 dark:text-purple-300">✎ Framed in my words</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {framings.map(({ s, f, id }) => (
            <Inset key={id} className="p-3 text-sm">
              <div className="mb-1 flex items-center gap-2"><Badge tone="purple">{f.preset}</Badge><span className="text-[11px] text-slate-500">{formatDateTime(f.at, tz)}</span></div>
              <button className="mb-1 text-left font-semibold hover:text-sky-500" onClick={() => s && go({ name: 'story', id })}>{s?.title ?? '(story)'}</button>
              <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{f.text}</p>
            </Inset>
          ))}
          {!framings.length && <p className="text-xs italic text-slate-400">Use “Frame It My Way” inside any story.</p>}
        </div>
      </Card>

      {user.questions.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-extrabold">Questions asked</h3>
          <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {user.questions.slice(0, 40).map((q, i) => (
              <div key={i} className="border-b border-slate-200 pb-1.5 dark:border-slate-800">
                <div className="font-semibold">{q.q}</div>
                <div className="line-clamp-2 text-slate-500">{q.a}</div>
                <div className="text-[10.5px] text-slate-400">{formatDateTime(q.at, tz)} · {q.provider}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Inspector o={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}

export function Saved() {
  const { user, stories, allOpps } = useApp();
  const [inspect, setInspect] = useState<GlobalOpportunity | null>(null);
  const ss = stories.filter((s) => user.savedStories.includes(s.id));
  const os = allOpps.filter((o) => user.savedOpps.includes(o.id));
  return (
    <div className="space-y-4">
      <SectionTitle>🔖 Saved</SectionTitle>
      <h3 className="font-bold">Stories ({ss.length})</h3>
      <div className="grid gap-3 lg:grid-cols-2">{ss.map((s) => <StoryCard key={s.id} s={s} />)}</div>
      {!ss.length && <Empty>No saved stories yet.</Empty>}
      <h3 className="font-bold">Opportunities ({os.length})</h3>
      <div className="grid gap-3 lg:grid-cols-2">{os.map((o) => <OppCard key={o.id} o={o} onInspect={() => setInspect(o)} />)}</div>
      {!os.length && <Empty>No tracked opportunities yet.</Empty>}
      <Inspector o={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}
