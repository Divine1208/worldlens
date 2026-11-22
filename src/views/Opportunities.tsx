import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { GlobalOpportunity, OppStatus, PipelineStage } from '../types';
import {
  EMPTY_FILTERS,
  OPP_CATEGORY_LABEL,
  computeStatus,
  daysRemaining,
  discoveryScore,
  filterOpportunities,
  matchIdea,
  type OppFilters,
} from '../lib/opportunities';
import { HUNTING_GROUNDS, UNCOMMON_TRIGGERS } from '../data/opportunities';
import { Badge, Btn, Card, Empty, Inset, Modal, SectionTitle, cx } from '../components/ui';
import { t } from '../lib/copy';
import { formatDateOnly, formatDateTime } from '../lib/time';
import { hasAI, hasSearch, huntOpportunities, type WebLead } from '../ai/router';
import { DEFAULTS } from '../config';

export const STAGES: PipelineStage[] = ['Not Started', 'Researching', 'Drafting Application', 'Submitted', 'Interview / Finals', 'Won / Funded'];

export function StatusBadge({ s }: { s: OppStatus }) {
  if (s === 'APPLY_NOW') return <Badge tone="emerald"><span className="animate-pulse">🔴</span> Apply now</Badge>;
  if (s === 'PREPARE_NOW') return <Badge tone="amber">🟡 Prepare now</Badge>;
  if (s === 'WATCH') return <Badge tone="sky">🟢 Watch</Badge>;
  return <Badge tone="slate">⚫ Closed</Badge>;
}

export function Countdown({ o }: { o: GlobalOpportunity }) {
  const { now, user } = useApp();
  const d = daysRemaining(o.deadlineISO, now, user.timezone);
  if (o.rolling && d === null) return <span className="text-emerald-600 dark:text-emerald-300">Rolling — apply any time</span>;
  if (d === null) return <span className="text-slate-500">The official source has not published a deadline yet.</span>;
  return (
    <span className={cx('font-mono font-bold tabular-nums', d <= DEFAULTS.urgentDays ? 'text-rose-500' : 'text-amber-600 dark:text-amber-300')}>
      {d === 0 ? 'Closes today' : `${d} day${d === 1 ? '' : 's'} left`} · {formatDateTime(o.deadlineISO, user.timezone)}
    </span>
  );
}

export function OppCard({ o, onInspect }: { o: GlobalOpportunity; onInspect: () => void }) {
  const { user, now, toggleSaveOpp, updateTracker } = useApp();
  const st = computeStatus(o, now);
  const tr = user.tracker[o.id];
  const saved = user.savedOpps.includes(o.id);
  const done = tr ? o.submission.filter((x) => tr.checked[x.id]).length : 0;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge s={st} />
        <Badge tone="indigo">{OPP_CATEGORY_LABEL[o.category]}</Badge>
        {o.origin === 'LIVE_WEB' && <Badge tone="emerald">🟢 Live web</Badge>}
        {!o.verified && <Badge tone="rose" title={o.verificationNote}>Unverified</Badge>}
        {o.takesEquity && <Badge tone="rose">⚠ Takes equity</Badge>}
        <Badge tone="amber" className="ml-auto" title="Value, non-dilutive, idea-stage access, India eligibility, friction, urgency, upside">
          Rank {discoveryScore(o, now, user.timezone)}
        </Badge>
      </div>
      <div>
        <h3 className="text-[16px] font-extrabold leading-snug">{o.name}</h3>
        <p className="text-xs text-slate-500">{o.organization} · {o.country}</p>
      </div>
      <Inset className="grid grid-cols-2 gap-2 p-3 text-sm">
        <div className="col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{t('bag', user.tone)}</div>
          <div className="font-bold text-emerald-700 dark:text-emerald-300">{o.bag}</div>
          <div className="text-xs text-slate-500">{o.fundingType}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">{t('clock', user.tone)}</div>
          <div className="text-sm"><Countdown o={o} /></div>
        </div>
      </Inset>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Badge tone={o.individualsCanApply === 'Yes' ? 'emerald' : 'slate'}>Solo: {o.individualsCanApply}</Badge>
        <Badge tone={o.studentsCanApply === 'Yes' ? 'emerald' : 'slate'}>Student: {o.studentsCanApply}</Badge>
        <Badge tone={o.indiansEligible === 'Yes' ? 'emerald' : o.indiansEligible === 'Unclear' ? 'amber' : 'rose'}>India 🇮🇳: {o.indiansEligible}</Badge>
        <Badge tone="slate">Age: {o.minAge ? `${o.minAge}+` : 'no minimum listed'}</Badge>
        <Badge tone="slate">Stage: {o.stage}</Badge>
      </div>
      <div className="text-sm">
        <b>{t('vibe', user.tone)}:</b> {o.vibe}
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300">
        <b>{t('worth', user.tone)}:</b> {o.whyWorthIt}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
        <select
          value={tr?.stage ?? 'Not Started'}
          onChange={(e) => updateTracker(o.id, { stage: e.target.value as PipelineStage })}
          className="rounded-lg border border-purple-500/40 bg-transparent px-2 py-1.5 text-xs font-semibold text-purple-700 dark:bg-slate-900 dark:text-purple-300"
          aria-label={`Pipeline stage for ${o.name}`}
        >
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Btn className="text-xs" onClick={() => toggleSaveOpp(o.id)}>{saved ? '🔖 Tracking' : 'Save / Track'}</Btn>
        <a href={o.officialUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          Official link ↗
        </a>
        <Btn variant="primary" className="ml-auto bg-purple-600 text-xs hover:bg-purple-500" onClick={onInspect}>
          📋 21-Point Sheet {tr && `(${done}/${o.submission.length})`}
        </Btn>
      </div>
    </Card>
  );
}

export function Inspector({ o, onClose }: { o: GlobalOpportunity | null; onClose: () => void }) {
  const { user, now, updateTracker } = useApp();
  if (!o) return null;
  const tr = user.tracker[o.id];
  const tz = user.timezone;
  const yn = (v: string) => <Badge tone={v === 'Yes' ? 'emerald' : v === 'No' ? 'rose' : 'amber'}>{v}</Badge>;
  const done = o.submission.filter((x) => tr?.checked[x.id]).length;
  const rows: [string, React.ReactNode][] = [
    ['1 · Official program name', o.name],
    ['2 · Organization running it', o.organization],
    ['3 · Country / region', o.country],
    ['4 · Opportunity category', OPP_CATEGORY_LABEL[o.category]],
    [`5 · What you actually need to do (${t('vibe', user.tone)})`, o.vibe],
    [`6 · Who can participate (${t('catch', user.tone)})`, o.whoCanParticipate],
    ['7 · Can individuals apply?', yn(o.individualsCanApply)],
    ['8 · Can students apply?', yn(o.studentsCanApply)],
    ['9 · Are Indian applicants eligible?', <span key="9">{yn(o.indiansEligible)} {o.indiansEligibleNote}</span>],
    ['10 · Minimum age', o.minAge ? `${o.minAge}+` : 'No minimum published'],
    ['11 · Required startup stage', o.stage === 'Idea' ? 'Idea-stage OK (no company/prototype needed)' : `${o.stage}-stage required`],
    ['12 · Application opening date', o.openingDate ? formatDateOnly(o.openingDate, tz) : o.rolling ? 'Rolling / always open' : 'Not published'],
    [`13 · Exact deadline (${t('clock', user.tone)})`, <span key="13"><Countdown o={o} />{o.deadlineNote && <div className="text-xs text-slate-500">{o.deadlineNote}</div>}</span>],
    [`14 · Funding / prize amount (${t('bag', user.tone)})`, o.bag],
    ['15 · Funding type', <span key="15">{o.fundingType}{o.takesEquity && <b className="text-rose-500"> — takes equity, this is not free money</b>}</span>],
    ['16 · What winners receive', o.winnersReceive],
    ['18 · Official application link', <a key="18" className="break-all text-sky-600 hover:underline dark:text-sky-300" href={o.officialUrl} target="_blank" rel="noreferrer">{o.officialUrl}</a>],
    ['19 · Official evidence', <ul key="19" className="space-y-0.5">{o.evidence.map((e) => <li key={e.url}><a className="text-sky-600 hover:underline dark:text-sky-300" href={e.url} target="_blank" rel="noreferrer">{e.label} ↗</a></li>)}{!o.verified && <li className="text-rose-500">⚠ {o.verificationNote}</li>}</ul>],
    ['20 · Date last checked', formatDateOnly(o.lastChecked, tz)],
    [`21 · ${t('worth', user.tone)}`, o.whyWorthIt],
  ];
  return (
    <Modal open={!!o} onClose={onClose} title={<span>📋 21-Point Sheet — {o.name} <StatusBadge s={computeStatus(o, now)} /></span>} wide>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="border-b border-slate-200 pb-2 text-sm dark:border-slate-800">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
            <div>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-purple-500/40 bg-purple-500/5 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold text-purple-700 dark:text-purple-300">17 · What needs to be submitted ({t('cheat', user.tone)}) — {done}/{o.submission.length} Done</h3>
          <select
            value={tr?.stage ?? 'Not Started'}
            onChange={(e) => updateTracker(o.id, { stage: e.target.value as PipelineStage })}
            className="rounded-lg border border-purple-500/40 bg-transparent px-2 py-1 text-xs dark:bg-slate-900"
            aria-label="Tracker stage"
          >
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          {o.submission.map((it) => (
            <label key={it.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-purple-600" checked={!!tr?.checked[it.id]} onChange={(e) => updateTracker(o.id, { checked: { [it.id]: e.target.checked } })} />
              <span className={cx(tr?.checked[it.id] && 'line-through opacity-60')}>{it.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input defaultValue={tr?.draftUrl ?? ''} onBlur={(e) => updateTracker(o.id, { draftUrl: e.target.value })} placeholder="Draft / submission link (Google Doc, Loom, GitHub…)" className="rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" aria-label="Draft link" />
          <textarea defaultValue={tr?.notes ?? ''} onBlur={(e) => updateTracker(o.id, { notes: e.target.value })} placeholder="Personal application notes" rows={2} className="rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" aria-label="Application notes" />
        </div>
      </div>
    </Modal>
  );
}

export function Opportunities() {
  const { allOpps, now, user, search, vault } = useApp();
  const tz = user.timezone;
  const [f, setF] = useState<OppFilters>(EMPTY_FILTERS);
  const [inspect, setInspect] = useState<GlobalOpportunity | null>(null);
  const [idea, setIdea] = useState('');
  const [ideaRes, setIdeaRes] = useState<ReturnType<typeof matchIdea> | null>(null);
  const [hunt, setHunt] = useState<{ q: string; leads: WebLead[]; provider: string; busy: boolean; err?: string }>({ q: '', leads: [], provider: '', busy: false });
  const filters = { ...f, q: [f.q, search].filter(Boolean).join(' ') };
  const list = useMemo(() => filterOpportunities(allOpps, filters, now, tz), [allOpps, filters.q, f, now, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<OppFilters>) => setF((x) => ({ ...x, ...p }));
  const sel = 'rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900';
  const countries = Array.from(new Set(allOpps.map((o) => o.country.split(' (')[0])));
  const sectors = Array.from(new Set(allOpps.flatMap((o) => o.sector))).slice(0, 30);

  const runHunt = async (q: string) => {
    setHunt({ q, leads: [], provider: '', busy: true });
    try {
      const r = await huntOpportunities(vault, q);
      setHunt({ q, leads: r.leads, provider: r.provider, busy: false });
    } catch (e) {
      setHunt({ q, leads: [], provider: '', busy: false, err: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Grants, prizes, fellowships, commissions, hackathons and incubators. Closed programs are never shown. Unverified items are labelled.">
        🎯 Global Opportunity Engine
      </SectionTitle>

      <Card className="space-y-3 p-4">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">9 hunting grounds — open a live search on each portal</div>
          <div className="flex flex-wrap gap-1.5">
            {HUNTING_GROUNDS.map((h) => (
              <a key={h.name} href={h.url(f.q || 'grant')} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:border-sky-500 dark:border-slate-700">
                {h.name} ↗
              </a>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Uncommon opportunity triggers {hasSearch(vault) && hasAI(vault) ? '— AI web hunt (results are unverified leads)' : '— needs a search key (Tavily/Serper) + AI key in the Vault'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {UNCOMMON_TRIGGERS.map((k) => (
              <Btn key={k} variant="outline" className="text-xs" disabled={!hasSearch(vault) || !hasAI(vault) || hunt.busy} onClick={() => runHunt(`${k} India eligible`)}>
                {k}
              </Btn>
            ))}
          </div>
          {(hunt.busy || hunt.leads.length > 0 || hunt.err) && (
            <Inset className="mt-2 space-y-2 p-3 text-sm">
              {hunt.busy && <div className="animate-pulse text-sky-500">Hunting “{hunt.q}” across the live web…</div>}
              {hunt.err && <div className="text-rose-500">{hunt.err}</div>}
              {hunt.leads.map((l, i) => (
                <div key={i} className="border-b border-slate-200 pb-2 last:border-0 dark:border-slate-800">
                  <Badge tone="rose">Unverified lead</Badge> <b>{l.name}</b> — {l.organization}{' '}
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-300">open ↗</a>
                  <div className="text-xs text-slate-500">
                    Deadline: {l.deadline ?? 'not stated in the result'} · Prize: {l.prize ?? 'not stated'} · {l.eligibility}
                  </div>
                </div>
              ))}
              {hunt.leads.length > 0 && <div className="text-[11px] text-slate-500">Extracted by {hunt.provider}. Verify each on the organisation’s official page before applying — these are not added to the ranked list.</div>}
            </Inset>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 font-extrabold">💭 Idea → Opportunity Matcher</h3>
        <p className="mb-2 text-xs text-slate-500">Type any raw idea — no company, team or prototype needed.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setIdeaRes(matchIdea(idea, allOpps, now, tz));
          }}
        >
          <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. a 5-minute AI short film about monsoon farmers" className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" aria-label="Your idea" />
          <Btn variant="primary">Match</Btn>
        </form>
        {ideaRes && (
          <div className="mt-3 space-y-1.5 text-sm">
            {ideaRes.slice(0, 6).map(({ o }) => (
              <button key={o.id} onClick={() => setInspect(o)} className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                <StatusBadge s={computeStatus(o, now)} />
                <span>
                  <b>{o.name}</b> — <span className="text-slate-500">pitch angle: frame your idea around “{o.sector.filter((s) => s !== 'Any').slice(0, 2).join(' / ') || o.category}” and show {o.stage === 'Idea' ? 'why you are the person to build it' : `a working ${o.stage.toLowerCase()}`}.</span>
                </span>
              </button>
            ))}
            {!ideaRes.length && <p className="text-xs text-slate-500">No strong matches in the current verified list. Try the hunting grounds above.</p>}
          </div>
        )}
      </Card>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search opportunities" className="min-w-[160px] flex-1 rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700" aria-label="Opportunity search" />
        <select className={sel} value={f.country} onChange={(e) => set({ country: e.target.value })} aria-label="Country">
          <option value="">Any country</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
          <option value="">All 10 categories</option>
          {Object.entries(OPP_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={f.sector} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector">
          <option value="">Any sector</option>
          {sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={f.minPrize} onChange={(e) => set({ minPrize: +e.target.value })} aria-label="Prize money">
          <option value={0}>Any prize</option>
          <option value={10000}>$10k+</option>
          <option value={50000}>$50k+</option>
          <option value={100000}>$100k+</option>
        </select>
        <label className="flex items-center gap-1 text-xs font-semibold">
          <input type="checkbox" checked={f.nonDilutiveOnly} onChange={(e) => set({ nonDilutiveOnly: e.target.checked })} /> Zero-equity only
        </label>
        <select className={sel} value={f.eligibility} onChange={(e) => set({ eligibility: e.target.value as OppFilters['eligibility'] })} aria-label="Eligibility">
          <option value="">Any eligibility</option>
          <option value="india">India-eligible</option>
          <option value="student">Students</option>
          <option value="individual">Individuals</option>
        </select>
        <select className={sel} value={f.maxMinAge ?? ''} onChange={(e) => set({ maxMinAge: e.target.value ? +e.target.value : null })} aria-label="My age">
          <option value="">Any age</option>
          {[13, 15, 17, 18, 21].map((a) => <option key={a} value={a}>I’m {a}</option>)}
        </select>
        <select className={sel} value={f.stage} onChange={(e) => set({ stage: e.target.value as OppFilters['stage'] })} aria-label="Stage">
          <option value="">Any stage</option>
          <option value="Idea">Idea-stage only</option>
          <option value="Prototype">Up to prototype</option>
          <option value="MVP">Up to MVP</option>
        </select>
        <select className={sel} value={f.deadlineWithin ?? ''} onChange={(e) => set({ deadlineWithin: e.target.value ? +e.target.value : null })} aria-label="Deadline">
          <option value="">Any deadline</option>
          <option value={15}>≤ 15 days</option>
          <option value={30}>≤ 30 days</option>
          <option value={90}>≤ 90 days</option>
        </select>
        <select className={sel} value={f.team} onChange={(e) => set({ team: e.target.value as OppFilters['team'] })} aria-label="Team">
          <option value="">Solo or team</option>
          <option value="Individual">Solo-friendly</option>
          <option value="Team">Team</option>
        </select>
        <select className={sel} value={f.mode} onChange={(e) => set({ mode: e.target.value as OppFilters['mode'] })} aria-label="Mode">
          <option value="">Online or offline</option>
          <option value="Online">Online</option>
          <option value="Offline">Offline</option>
        </select>
        <Btn className="text-xs" onClick={() => setF(EMPTY_FILTERS)}>Reset</Btn>
      </Card>

      <div className="text-xs text-slate-500">{list.length} active opportunities (closed ones excluded) · ranked by discovery score</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((o) => <OppCard key={o.id} o={o} onInspect={() => setInspect(o)} />)}
      </div>
      {!list.length && <Empty>No active opportunities match these filters.</Empty>}
      <Inspector o={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}
