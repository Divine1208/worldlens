import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Badge, Btn, Card, Empty, Inset, cx } from '../components/ui';
import { OriginBadge, TimestampReceipt } from '../components/StoryCard';
import { ConceptText } from '../components/ConceptText';
import { deepDive, hasAI, reframe, FRAME_PRESETS, type DeepDive } from '../ai/router';
import { t, CATEGORY_META } from '../lib/copy';
import { formatDateTime } from '../lib/time';
import { jaccard } from '../lib/cluster';
import type { SearchHit } from '../ai/providers';

const LABEL_TONE = { FACT: 'emerald', CLAIM: 'amber', ANALYSIS: 'indigo', UNCONFIRMED: 'rose' } as const;

export function StoryReader({ id }: { id: string }) {
  const app = useApp();
  const { stories, user, setUser, setRead, toggleSaveStory, go, openDrawer, vault, learnConcept } = app;
  const s = stories.find((x) => x.id === id);
  const [dd, setDd] = useState<{ data: DeepDive; provider: string; web: SearchHit[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const tone = user.tone;

  useEffect(() => {
    if (s && user.autoMarkRead) setRead(s.id, true);
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDd(null);
    setErr('');
    if (!s || !hasAI(vault)) return;
    setBusy(true);
    deepDive(vault, s, tone)
      .then((r) => {
        setDd(r);
        r.data.keyTerms?.forEach(() => undefined);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [s?.id, s?.sources.length, tone, vault]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!app.loaded) return <Empty>Loading archive…</Empty>;
  if (!s) return <Empty>Story not found in your archive. <Btn onClick={() => go({ name: 'today' })}>← Back</Btn></Empty>;

  const read = !!user.readMap[s.id];
  const saved = user.savedStories.includes(s.id);
  const size = { S: 'text-[14px]', M: 'text-[15.5px]', L: 'text-[17.5px]' }[user.fontSize];
  const related = stories
    .filter((x) => x.id !== s.id)
    .map((x) => ({ x, sc: jaccard(x.tokens, s.tokens) + x.concepts.filter((c) => s.concepts.includes(c)).length * 0.08 }))
    .filter((r) => r.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 6);
  const terms = Array.from(new Set([...(s.concepts ?? []), ...((dd?.data.keyTerms ?? []) as string[])]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/90 p-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:top-[112px]">
        <Btn onClick={() => history.length > 1 ? history.back() : go({ name: 'today' })}>← Back to Intelligence Feed</Btn>
        <Btn onClick={() => setRead(s.id, !read)}>{read ? '✓ Read — mark unread' : '● Mark read'}</Btn>
        <Btn variant="outline" onClick={() => openDrawer({ tab: 'chat', storyId: s.id })}>✦ Ask AI about this story</Btn>
        <Btn onClick={() => toggleSaveStory(s.id)}>{saved ? '🔖 Saved' : 'Save story'}</Btn>
        <div className="ml-auto flex items-center gap-1">
          {(['S', 'M', 'L'] as const).map((f) => (
            <button key={f} onClick={() => setUser((u) => ({ ...u, fontSize: f }))} className={cx('h-7 w-7 rounded-lg text-xs font-bold', user.fontSize === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800')}>
              {f}
            </button>
          ))}
          <button
            onClick={() => setUser((u) => ({ ...u, tone: u.tone === 'genz' ? 'analyst' : 'genz' }))}
            className={cx('ml-1 rounded-lg px-2 py-1 text-xs font-bold', tone === 'genz' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-slate-500/15')}
          >
            {tone === 'genz' ? 'Simple' : 'Analyst'}
          </button>
        </div>
      </div>

      <Card className="p-5 sm:p-7">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <OriginBadge s={s} />
          <Badge tone="indigo">{CATEGORY_META[s.category].emoji} {CATEGORY_META[s.category].label}</Badge>
          <Badge tone={s.confidence === 'VERIFIED' ? 'emerald' : s.confidence === 'DEVELOPING' ? 'amber' : 'rose'}>{s.confidence}</Badge>
          <Badge tone="sky">{s.sources.length} source{s.sources.length > 1 ? 's' : ''} clustered</Badge>
          <Badge tone="amber">Impact {s.importance}/100</Badge>
        </div>
        <h1 className="mb-4 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{s.title}</h1>
        <TimestampReceipt s={{ ...s, eventDate: dd?.data.eventDate ?? s.eventDate }} cols={4} />

        <div className={cx('mt-5 space-y-6 leading-relaxed', size)}>
          {busy && <div className="animate-pulse rounded-xl bg-sky-500/10 p-4 text-sm text-sky-700 dark:text-sky-300">Reading every source + today’s live web, then writing the breakdown…</div>}
          {err && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">AI analysis failed: {err}. The verified source material is still below — nothing is lost.</div>}
          {!hasAI(vault) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              {t('noAI', tone)}{' '}
              <button className="font-bold underline" onClick={() => app.setModal('vault')}>
                Open API Vault
              </button>
            </div>
          )}

          {dd && <DeepDiveBody d={dd.data} storyId={s.id} tone={tone} provider={dd.provider} />}

          {!dd && (
            <Section title={tone === 'genz' ? 'What the sources actually say' : 'Primary source material'}>
              <div className="space-y-3">
                {s.sources.map((src) => (
                  <Inset key={src.id} className="p-3">
                    <div className="text-xs text-slate-500">
                      {src.publisher} • {src.timestampKind === 'first-seen' ? 'first seen' : 'published'} {formatDateTime(src.publicationDate, user.timezone)}
                    </div>
                    <div className="font-semibold">{src.title}</div>
                    {src.summary && (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        <ConceptText text={src.summary} storyId={s.id} />
                      </p>
                    )}
                  </Inset>
                ))}
              </div>
            </Section>
          )}

          <FrameStudio storyId={s.id} />

          {terms.length > 0 && (
            <Section title="Key terms">
              <div className="flex flex-wrap gap-1.5">
                {terms.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      openDrawer({ tab: 'term', term: c, storyId: s.id });
                      learnConcept(c);
                    }}
                    className="rounded-full border border-sky-500/40 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
                  >
                    {c} {user.learnedConcepts[c] && '✓'}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {related.length > 0 && (
            <Section title="Related developments">
              <ul className="space-y-1 text-sm">
                {related.map(({ x }) => (
                  <li key={x.id}>
                    <button className="text-left hover:text-sky-600" onClick={() => go({ name: 'story', id: x.id })}>
                      <Badge tone="indigo">{CATEGORY_META[x.category].label}</Badge> {x.title}{' '}
                      <span className="text-xs text-slate-500">({formatDateTime(x.publishedAt, user.timezone)})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Primary & verified sources">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10.5px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-1 pr-3">Source</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Published</th>
                    <th className="py-1 pr-3">Retrieved</th>
                    <th className="py-1">Claim supported</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sources.map((src) => (
                    <tr key={src.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 pr-3">
                        <a href={src.url} target="_blank" rel="noreferrer" className="font-semibold text-sky-600 hover:underline dark:text-sky-300">
                          {src.publisher} ↗
                        </a>
                      </td>
                      <td className="pr-3 text-xs">{src.sourceType} · tier {src.credibilityTier}</td>
                      <td className="pr-3 font-mono text-xs">{formatDateTime(src.publicationDate, user.timezone)}{src.timestampKind === 'first-seen' && ' (first seen)'}</td>
                      <td className="pr-3 font-mono text-xs">{formatDateTime(src.retrievedAt, user.timezone)}</td>
                      <td className="text-xs">{src.title}</td>
                    </tr>
                  ))}
                  {dd?.web.map((w) => (
                    <tr key={w.url} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 pr-3">
                        <a href={w.url} target="_blank" rel="noreferrer" className="font-semibold text-sky-600 hover:underline dark:text-sky-300">
                          {new URL(w.url).hostname.replace('www.', '')} ↗
                        </a>
                      </td>
                      <td className="pr-3 text-xs">live web ({w.source})</td>
                      <td className="pr-3 font-mono text-xs">{w.date ?? '—'}</td>
                      <td className="pr-3 font-mono text-xs">this session</td>
                      <td className="text-xs">{w.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'amber' | 'purple' }) {
  return (
    <section className={cx(tone === 'amber' && 'rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4', tone === 'purple' && 'rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4')}>
      <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function P({ text, storyId }: { text?: string; storyId: string }) {
  if (!text) return <p className="italic text-slate-400">Not stated in the sources yet.</p>;
  return (
    <p>
      <ConceptText text={text} storyId={storyId} />
    </p>
  );
}

function DeepDiveBody({ d, storyId, tone, provider }: { d: DeepDive; storyId: string; tone: 'genz' | 'analyst'; provider: string }) {
  return (
    <>
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-300">
          {tone === 'genz' ? '✦ Plain-English TL;DR' : 'Executive summary'} <span className="font-normal normal-case text-slate-500">· written by {provider}</span>
        </div>
        <P text={d.tldr} storyId={storyId} />
      </div>
      <Section title="What actually happened">
        <P text={d.whatHappened} storyId={storyId} />
        {d.keyDetails?.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {d.keyDetails.map((k, i) => (
              <li key={i}>
                <ConceptText text={k} storyId={storyId} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      {d.evidence?.length > 0 && (
        <Section title="Evidence check: fact vs claim vs analysis">
          <ul className="space-y-1.5">
            {d.evidence.map((e, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone={LABEL_TONE[e.label] ?? 'slate'}>{e.label}</Badge>
                <span>
                  {e.point} {e.source && <span className="text-xs text-slate-500">[{e.source}]</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.conflicts && (
        <Section title="Conflicting reports" tone="amber">
          <div className="grid gap-2 sm:grid-cols-2">
            <Inset className="p-3 text-sm"><b>Source A says:</b> {d.conflicts.sourceA}</Inset>
            <Inset className="p-3 text-sm"><b>Source B says:</b> {d.conflicts.sourceB}</Inset>
            <Inset className="p-3 text-sm"><b>What is confirmed:</b> {d.conflicts.confirmed}</Inset>
            <Inset className="p-3 text-sm"><b>What remains uncertain:</b> {d.conflicts.uncertain}</Inset>
          </div>
        </Section>
      )}
      <Section title="Background & why it happened">
        <P text={d.background} storyId={storyId} />
      </Section>
      {d.whoIsInvolved?.length > 0 && (
        <Section title="Who is involved">
          <div className="flex flex-wrap gap-1.5">{d.whoIsInvolved.map((w) => <Badge key={w} tone="slate">{w}</Badge>)}</div>
        </Section>
      )}
      {d.timeline?.length > 0 && (
        <Section title="Verified timeline">
          <ol className="relative ml-2 border-l-2 border-sky-500/40 pl-4">
            {d.timeline.map((e, i) => (
              <li key={i} className="mb-3">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-sky-500" />
                <div className="font-mono text-xs text-slate-500">{e.date} {e.source && `· ${e.source}`}</div>
                <div>{e.event}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section title="Why does it matter?"><P text={d.whyItMatters} storyId={storyId} /></Section>
      <Section title="Impact on India"><P text={d.impactIndia} storyId={storyId} /></Section>
      <Section title="Economic & business impact"><P text={d.economicImpact} storyId={storyId} /></Section>
      {d.entrepreneurLens && (
        <Section title={t('lens', tone)} tone="amber">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-bold">Problem getting bigger</dt><dd>{d.entrepreneurLens.problem}</dd></div>
            <div><dt className="font-bold">Customer behaviour shifting</dt><dd>{d.entrepreneurLens.behaviourShift}</dd></div>
            <div><dt className="font-bold">Industries benefiting</dt><dd>{d.entrepreneurLens.benefiting}</dd></div>
            <div><dt className="font-bold">Industries disrupted</dt><dd>{d.entrepreneurLens.disrupted}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold">Actionable market gap</dt><dd>{d.entrepreneurLens.marketGap}</dd></div>
          </dl>
        </Section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="What remains unclear?">
          <ul className="list-disc space-y-1 pl-5">{(d.unclear?.length ? d.unclear : ['Nothing flagged.']).map((u, i) => <li key={i}>{u}</li>)}</ul>
        </Section>
        <Section title="What to watch next">
          <ul className="list-disc space-y-1 pl-5">{(d.watchNext ?? []).map((u, i) => <li key={i}>{u}</li>)}</ul>
        </Section>
      </div>
    </>
  );
}

function FrameStudio({ storyId }: { storyId: string }) {
  const { user, setUser, stories, vault } = useApp();
  const s = stories.find((x) => x.id === storyId)!;
  const saved = user.framings[storyId];
  const [text, setText] = useState(saved?.text ?? '');
  const [preset, setPreset] = useState(saved?.preset ?? '17yo Gen-Z Friend');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const gen = async () => {
    setBusy(true);
    setMsg('');
    try {
      const instr = preset === 'Custom' ? custom : FRAME_PRESETS[preset as keyof typeof FRAME_PRESETS];
      const r = await reframe(vault, s, instr);
      setText(r.text);
      setMsg(`Drafted by ${r.provider}. Edit freely, then save.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    setUser((u) => ({ ...u, framings: { ...u.framings, [storyId]: { preset, text, at: new Date().toISOString() } } }));
    setMsg('Saved to My Knowledge ✓');
  };
  return (
    <Section title="✎ Frame It My Way studio" tone="purple">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {[...Object.keys(FRAME_PRESETS), 'Custom'].map((p) => (
          <button key={p} onClick={() => setPreset(p)} className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold', preset === p ? 'border-purple-500 bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'border-slate-300 dark:border-slate-700')}>
            {p}
          </button>
        ))}
      </div>
      {preset === 'Custom' && (
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Explain it like a cricket commentary, keep all numbers" className="mb-2 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Write this story in your own words, or generate a draft with AI and edit it."
        className="w-full rounded-xl border border-slate-300 bg-white/50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/50"
        aria-label="My framing"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn variant="outline" onClick={gen} disabled={busy || !hasAI(vault)} title={!hasAI(vault) ? 'Add an AI key in the Vault' : ''}>
          {busy ? 'Drafting…' : '✦ Draft with AI'}
        </Btn>
        <Btn variant="primary" className="bg-purple-600 hover:bg-purple-500" onClick={save} disabled={!text.trim()}>
          Save my framing
        </Btn>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </Section>
  );
}
