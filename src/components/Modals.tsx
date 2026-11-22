import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Badge, Btn, Inset, Modal, cx } from './ui';
import { NEWS_ADAPTERS } from '../adapters';
import { formatDateTime } from '../lib/time';
import type { Vault } from '../types';

const API_MATRIX = [
  ['GDELT Project DOC 2.0', '100% free, fair-use', 'Every 15 min', '195+ countries, strong Indian press', '$0/mo', 'Primary free adapter'],
  ['Official RSS (PIB, RBI, SEBI)', '100% free public RSS', 'Real-time on release', 'Gold-standard Indian primary truth', '$0/mo', 'Primary official adapter'],
  ['Hacker News Algolia', '100% free, 10,000 req/hr', 'Real-time', 'Global AI, chips, startups, open-source', '$0/mo', 'Tech discovery signal'],
  ['Google News RSS + publisher RSS', 'Free public RSS', '5–15 min', 'Excellent India (gl=IN) & global', '$0/mo', 'Primary broad adapter'],
  ['The Guardian Open Platform', 'Free key, 500 calls/day', 'Real-time', 'High-quality global, economy, tech', '$0/mo', 'Active global adapter (key)'],
  ['NewsData.io', 'Free 200 credits/day (delayed) · paid live', '30 min free / live paid', '200+ countries, strong Indian regional', '$0 free / $199/mo Basic', 'Optional paid upgrade'],
  ['MediaStack', 'Free 100 req/mo (too low)', '30 min free', 'Moderate India', '$24.99/mo Standard', 'Budget paid alternative'],
  ['NewsAPI.org', 'Free 100/day, localhost only, 24h delay', '24h delay free', 'Good, blocks commercial free use', '$449/mo Business', 'Not recommended'],
];

export function HealthModal() {
  const { modal, setModal, health, rejected, user, setUser, poll, polling } = useApp();
  const tz = user.timezone;
  const toggle = (id: string) =>
    setUser((u) => ({ ...u, disabledAdapters: u.disabledAdapters.includes(id) ? u.disabledAdapters.filter((x) => x !== id) : [...u.disabledAdapters, id] }));
  const all = [...NEWS_ADAPTERS.map((a) => ({ id: a.id, label: a.label, tier: a.tier })), { id: 'devpost', label: 'Devpost — open hackathons', tier: 'Free public API' }];
  return (
    <Modal open={modal === 'health'} onClose={() => setModal(null)} title="Source Health & News API Research Matrix" wide>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Every adapter, what it fetched, and every item the timestamp validator threw out.</p>
        <Btn variant="primary" onClick={poll} disabled={polling}>{polling ? 'Polling…' : 'Manual refresh'}</Btn>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((a) => {
          const h = health.find((x) => x.adapter === a.id);
          const disabled = user.disabledAdapters.includes(a.id);
          const st = disabled ? 'DISABLED' : h?.status ?? 'IDLE';
          return (
            <Inset key={a.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate">{a.label}</b>
                <Badge tone={st === 'HEALTHY' ? 'emerald' : st === 'DEGRADED' ? 'rose' : st === 'NEEDS_KEY' ? 'amber' : 'slate'}>● {st.replace('_', ' ')}</Badge>
              </div>
              <div className="text-[11px] text-slate-500">{a.tier}</div>
              {h && !disabled && (
                <div className="mt-1 font-mono text-[11px] text-slate-500">
                  {h.fetched} fetched · {h.accepted} accepted · {h.rejected} rejected {h.route && `· via ${h.route}`}
                  <br />checked {h.checkedAt ? formatDateTime(h.checkedAt, tz) : '—'}
                  {h.error && <div className="text-rose-500">{h.error}</div>}
                </div>
              )}
              <button className="mt-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300" onClick={() => toggle(a.id)}>{disabled ? 'Enable source' : 'Disable source'}</button>
            </Inset>
          );
        })}
      </div>

      <h3 className="mb-1 mt-5 font-bold">Rejected timestamp log ({rejected.length})</h3>
      <Inset className="max-h-48 overflow-y-auto p-2 font-mono text-[11px]">
        {rejected.slice(0, 120).map((r, i) => (
          <div key={i} className="truncate">
            <span className={r.reason === 'future' ? 'text-rose-500' : 'text-amber-500'}>[{r.reason}]</span> {r.adapter}: {r.title} <span className="text-slate-500">({r.raw || 'no timestamp'})</span>
          </div>
        ))}
        {!rejected.length && <div className="text-slate-500">No rejected items yet.</div>}
      </Inset>

      <h3 className="mb-1 mt-5 font-bold">Free vs paid news API comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="uppercase tracking-wider text-slate-400">
            <tr>{['Provider', 'Tier / free limit', 'Freshness', 'India & global coverage', 'Monthly cost', 'Role in app'].map((h) => <th key={h} className="py-1 pr-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {API_MATRIX.map((r) => (
              <tr key={r[0]} className="border-t border-slate-200 dark:border-slate-800">{r.map((c, i) => <td key={i} className={cx('py-1.5 pr-2', i === 0 && 'font-semibold')}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">Prices are list prices noted in the build spec; check each provider’s pricing page before paying.</p>
      </div>
    </Modal>
  );
}

const KEY_FIELDS: { k: keyof Vault; label: string; hint: string; url: string }[] = [
  { k: 'gemini', label: 'Google Gemini', hint: 'Free tier · gemini-2.5-flash with Google Search grounding', url: 'https://aistudio.google.com/apikey' },
  { k: 'groq', label: 'Groq Cloud', hint: 'Free tier · llama-3.3-70b-versatile', url: 'https://console.groq.com/keys' },
  { k: 'openrouter', label: 'OpenRouter', hint: 'Free models (openrouter/free)', url: 'https://openrouter.ai/keys' },
  { k: 'tavily', label: 'Tavily Search', hint: 'Free 1,000 searches/mo — lets any LLM read today’s web', url: 'https://app.tavily.com' },
  { k: 'serper', label: 'Serper.dev', hint: '2,500 free Google queries', url: 'https://serper.dev' },
  { k: 'guardian', label: 'The Guardian', hint: 'Free key · 500 calls/day', url: 'https://open-platform.theguardian.com/access/' },
  { k: 'newsdata', label: 'NewsData.io', hint: 'Free 200 credits/day', url: 'https://newsdata.io/register' },
];

export function VaultModal() {
  const { modal, setModal, vault, setVault, user, setUser } = useApp();
  const [v, setV] = useState<Vault>(vault);
  const [saved, setSaved] = useState(false);
  const open = modal === 'vault';
  const up = (p: Partial<Vault>) => {
    setSaved(false);
    setV((x) => ({ ...x, ...p }));
  };
  const move = (i: number, d: number) => {
    const o = [...v.routerOrder];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    up({ routerOrder: o });
  };
  return (
    <Modal open={open} onClose={() => setModal(null)} title="🔐 API Vault & Schedule" wide>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Zero-install mode: keys are stored only in this browser’s localStorage and sent only to that provider. For a public deployment use server
            environment variables instead (see README) and switch on “Use server keys”.
          </p>
          {KEY_FIELDS.map((f) => (
            <label key={f.k} className="block text-sm">
              <span className="flex items-center justify-between font-semibold">
                {f.label}
                <a href={f.url} target="_blank" rel="noreferrer" className="text-[11px] font-normal text-sky-600 dark:text-sky-300">get free key ↗</a>
              </span>
              <input
                type="password"
                autoComplete="off"
                value={(v[f.k] as string) ?? ''}
                onChange={(e) => up({ [f.k]: e.target.value.trim() || undefined } as Partial<Vault>)}
                placeholder={f.hint}
                className="mt-0.5 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-slate-700"
              />
            </label>
          ))}
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 font-semibold">Preferred LLM router order (fallback chain)</div>
            {v.routerOrder.map((id, i) => (
              <div key={id} className="mb-1 flex items-center gap-2">
                <span className="w-5 font-mono text-xs text-slate-500">{i + 1}.</span>
                <span className="flex-1 capitalize">{id} {v[id] ? <Badge tone="emerald">key set</Badge> : <Badge tone="slate">no key</Badge>}</span>
                <Btn className="px-2 text-xs" onClick={() => move(i, -1)}>↑</Btn>
                <Btn className="px-2 text-xs" onClick={() => move(i, 1)}>↓</Btn>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.ensemble} onChange={(e) => up({ ensemble: e.target.checked })} /> Ensemble accuracy mode (second provider fact-checks each chat answer)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.useServer} onChange={(e) => up({ useServer: e.target.checked })} /> Use server keys (Option B: deployed with env vars)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <div className="font-semibold">Backend poll interval</div>
              <select value={v.pollIntervalMin} onChange={(e) => up({ pollIntervalMin: +e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                {[15, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
              </select>
            </label>
            <label>
              <div className="font-semibold">UI refresh interval</div>
              <select value={v.uiRefreshSec} onChange={(e) => up({ uiRefreshSec: +e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                {[10, 30, 60].map((n) => <option key={n} value={n}>{n} sec</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <div className="font-semibold">Timezone (daily cycle)</div>
            <select value={user.timezone} onChange={(e) => setUser((u) => ({ ...u, timezone: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
              {['Asia/Kolkata', 'UTC', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={user.autoMarkRead} onChange={(e) => setUser((u) => ({ ...u, autoMarkRead: e.target.checked }))} /> Auto-mark a story read when I open its deep dive
          </label>
          <Inset className="p-3 text-xs leading-relaxed">
            <b>Install as an app:</b> Chrome/Edge → install icon in the address bar. Android → ⋮ → Add to Home screen. iPhone → Share → Add to Home Screen.
            <br />
            <b>Self-host:</b> <code>npm install && npm run build && npm run preview</code> or deploy the folder to Vercel (API routes included).
          </Inset>
          <div className="flex items-center gap-2">
            <Btn variant="primary" onClick={() => { setVault(v); setSaved(true); }}>Save vault</Btn>
            {saved && <span className="text-xs text-emerald-500">Saved ✓</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
