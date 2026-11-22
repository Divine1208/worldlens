import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { CURATED_MARKET_MODELS } from '../data/marketModels';
import { hasAI, marketGapsFromNews } from '../ai/router';
import type { MarketOpportunity } from '../types';
import { Badge, Btn, Card, Inset, SectionTitle } from '../components/ui';
import { rankFlat } from '../lib/lifecycle';

const VTONE = { 'PROVEN BUSINESS MODEL': 'emerald', 'EMERGING MODEL': 'amber', 'HYPOTHETICAL IDEA': 'rose' } as const;
const KTONE = { Evidence: 'emerald', Inference: 'amber', Speculation: 'rose' } as const;

export function MarketGaps() {
  const { vault, todayStories, stories, search } = useApp();
  const [ai, setAi] = useState<MarketOpportunity[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pool = todayStories.length ? todayStories : stories;
  const q = search.toLowerCase();
  const list = [...ai, ...CURATED_MARKET_MODELS].filter((m) => !q || JSON.stringify(m).toLowerCase().includes(q));
  return (
    <div className="space-y-4">
      <SectionTitle
        sub="Evidence first. Every card separates Evidence (seen in the real world) from Inference and Speculation. Capital is a bucket, never a fake number."
        right={
          <Btn
            variant="primary"
            disabled={busy || !hasAI(vault) || !pool.length}
            title={!hasAI(vault) ? 'Add an AI key in the Vault' : !pool.length ? 'Poll news first' : ''}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                const r = await marketGapsFromNews(vault, rankFlat(pool));
                setAi(r);
                if (!r.length) setErr('The AI found no evidence-backed gaps in today’s stories — that’s an honest answer, not an error.');
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Scanning today’s news…' : '✦ Find gaps in today’s live news'}
          </Btn>
        }
      >
        💡 Market & Business Opportunity Discovery
      </SectionTitle>
      {err && <Inset className="p-3 text-sm text-amber-700 dark:text-amber-300">{err}</Inset>}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((m) => (
          <Card key={m.id} className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={VTONE[m.validation] ?? 'slate'}>{m.validation}</Badge>
              <Badge tone="indigo">{m.sector}</Badge>
              <Badge tone="amber">Capital: {m.capital}</Badge>
              <Badge tone={m.origin === 'CURATED' ? 'slate' : 'emerald'}>{m.origin === 'CURATED' ? 'Curated model' : '🟢 From today’s live news'}</Badge>
            </div>
            <h3 className="text-[16px] font-extrabold leading-snug">{m.title}</h3>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {(
                [
                  ['Where it’s working', m.whereWorking],
                  ['Problem', m.problem],
                  ['Who pays', m.customer],
                  ['Business model', m.businessModel],
                  ['Why it works', m.whyItWorks],
                  ['Why not mainstream yet', m.whyNotMainstream],
                  ['India potential', m.indiaPotential],
                  ['Competition', m.competition],
                  ['Risks', m.risks],
                  ['Skills required', (m.skills ?? []).join(', ')],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
                  <dd>{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <Inset className="space-y-1.5 p-3 text-sm">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Real-world evidence</div>
              {m.evidence.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <Badge tone={KTONE[e.kind]}>{e.kind}</Badge>
                  <span>
                    {e.text}{' '}
                    {e.url && (
                      <a className="text-sky-600 hover:underline dark:text-sky-300" href={e.url} target="_blank" rel="noreferrer">
                        source ↗
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </Inset>
          </Card>
        ))}
      </div>
    </div>
  );
}
