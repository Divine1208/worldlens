import type { MarketOpportunity, NewsStory, Vault } from '../types';
import { callLLM, callSearch, type LLMId, type LLMRequest, type LLMResponse, type SearchHit } from './providers';
import { hash } from '../lib/cluster';
import { sanitizeDeep, sanitizeGenZ } from '../lib/genz';
import { STORAGE_KEYS } from '../config';

export class NoProviderError extends Error {
  constructor() {
    super('No AI provider configured. Add a free Gemini, Groq or OpenRouter key in the API Vault (or deploy with server env keys).');
  }
}

/* ---------- cache ---------- */
function readCache(): Record<string, { at: number; v: unknown }> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.aiCache) || '{}');
  } catch {
    return {};
  }
}
function cacheGet<T>(k: string, maxAgeMs: number): T | undefined {
  const c = readCache()[k];
  if (c && Date.now() - c.at < maxAgeMs) return c.v as T;
}
function cacheSet(k: string, v: unknown) {
  try {
    const c = readCache();
    c[k] = { at: Date.now(), v };
    const keys = Object.keys(c);
    if (keys.length > 300) keys.sort((a, b) => c[a].at - c[b].at).slice(0, 100).forEach((x) => delete c[x]);
    localStorage.setItem(STORAGE_KEYS.aiCache, JSON.stringify(c));
  } catch {
    /* quota — cache is optional */
  }
}

/* ---------- routing ---------- */
function available(v: Vault): LLMId[] {
  return v.routerOrder.filter((id) => !!v[id]);
}

export function hasAI(v: Vault) {
  return v.useServer || available(v).length > 0;
}
export function hasSearch(v: Vault) {
  return v.useServer || !!v.tavily || !!v.serper;
}

async function viaServer(req: LLMRequest): Promise<LLMResponse> {
  const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error(`server AI: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** Free-first fallback chain: tries providers in the user's preferred order until one answers. */
export async function route(v: Vault, req: LLMRequest): Promise<LLMResponse & { tried: string[] }> {
  const tried: string[] = [];
  if (v.useServer) {
    try {
      return { ...(await viaServer(req)), tried: ['server'] };
    } catch (e) {
      tried.push(`server ✗ ${(e as Error).message}`);
    }
  }
  const ids = available(v);
  if (!ids.length && !tried.length) throw new NoProviderError();
  for (const id of ids) {
    try {
      const r = await callLLM(id, v[id]!, req.grounded && id !== 'gemini' ? { ...req, grounded: false } : req);
      return { ...r, tried: [...tried, `${id} ✓`] };
    } catch (e) {
      tried.push(`${id} ✗ ${(e as Error).message.slice(0, 80)}`);
    }
  }
  throw new Error('All AI providers failed: ' + tried.join(' · '));
}

export async function webSearch(v: Vault, q: string, news = true): Promise<SearchHit[]> {
  if (v.useServer) {
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&news=${news ? 1 : 0}`);
      if (r.ok) return r.json();
    } catch {
      /* fall through */
    }
  }
  if (v.tavily) {
    try {
      return await callSearch('tavily', v.tavily, q, news);
    } catch {
      /* try serper */
    }
  }
  if (v.serper) return callSearch('serper', v.serper, q, news);
  return [];
}

export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (start < 0 || end < 0) throw new Error('AI did not return JSON');
  return JSON.parse(body.slice(start, end + 1));
}

/* ---------- prompts ---------- */
const VOICE = {
  genz: `VOICE: Explain like a sharp, chill 17-year-old explaining to a friend. Short punchy sentences. Use everyday Indian analogies (pocket money, chai stalls, UPI, exam halls, Netflix, sneaker drops) when explaining money/legal/tech ideas. Explain every hard term the first time you use it. Never use these words: comprehensive, synergy, pivot, fiduciary, infrastructure, ecosystem, paradigm. Do NOT use forced slang. Stay trustworthy.`,
  analyst: `VOICE: Formal institutional analyst register suitable for reports and exams. Precise, neutral, structured.`,
};

const RULES = `HARD RULES:
- Use ONLY facts present in the SOURCES block (and SEARCH RESULTS if given). Never invent numbers, dates, quotes, names or URLs.
- Keep every real figure, date and official name exactly as in the sources ("keep the receipts").
- If something is not in the sources, say "Not stated in the sources yet."
- Label claims honestly: FACT (stated by a credible source), CLAIM (someone asserts it), ANALYSIS (reasoned inference), UNCONFIRMED.
- Politics: strictly neutral. Never recommend how to vote, never rank politicians, never predict election winners.
- No length cap — be as complete as the sources allow, but no filler.`;

function sourcesBlock(s: NewsStory, extra: SearchHit[] = []) {
  const src = s.sources
    .map(
      (x, i) =>
        `[S${i + 1}] ${x.publisher} | ${x.timestampKind === 'first-seen' ? 'first seen' : 'published'} ${x.publicationDate} | ${x.url}\nTITLE: ${x.title}\n${x.summary ? 'SNIPPET: ' + x.summary : ''}`,
    )
    .join('\n\n');
  const sr = extra.length
    ? '\n\nSEARCH RESULTS (live web, retrieved now):\n' +
      extra.map((h, i) => `[W${i + 1}] ${h.title} | ${h.date ?? 'date n/a'} | ${h.url}\n${h.snippet}`).join('\n\n')
    : '';
  return `SOURCES:\n${src}${sr}`;
}

export interface DeepDive {
  tldr: string;
  whatHappened: string;
  keyDetails: string[];
  evidence: { point: string; label: 'FACT' | 'CLAIM' | 'ANALYSIS' | 'UNCONFIRMED'; source?: string }[];
  conflicts: { sourceA: string; sourceB: string; confirmed: string; uncertain: string } | null;
  background: string;
  whoIsInvolved: string[];
  timeline: { date: string; event: string; source?: string }[];
  whyItMatters: string;
  impactIndia: string;
  economicImpact: string;
  entrepreneurLens: { problem: string; behaviourShift: string; benefiting: string; disrupted: string; marketGap: string } | null;
  unclear: string[];
  watchNext: string[];
  eventDate?: string | null;
  keyTerms: string[];
}

export async function deepDive(v: Vault, story: NewsStory, tone: 'genz' | 'analyst') {
  const key = 'dd:' + hash(story.id + story.sources.length + tone);
  const cached = cacheGet<{ data: DeepDive; provider: string; web: SearchHit[] }>(key, 6 * 3600000);
  if (cached) return { ...cached, cached: true };
  let web: SearchHit[] = [];
  if (hasSearch(v)) {
    try {
      web = (await webSearch(v, story.title)).slice(0, 6);
    } catch {
      web = [];
    }
  }
  const schema = `Return ONLY JSON: {"tldr":string,"whatHappened":string,"keyDetails":string[],"evidence":[{"point":string,"label":"FACT|CLAIM|ANALYSIS|UNCONFIRMED","source":"S1|W2|..."}],"conflicts":null|{"sourceA":string,"sourceB":string,"confirmed":string,"uncertain":string},"background":string,"whoIsInvolved":string[],"timeline":[{"date":"YYYY-MM-DD or as stated","event":string,"source":string}],"whyItMatters":string,"impactIndia":string,"economicImpact":string,"entrepreneurLens":null|{"problem":string,"behaviourShift":string,"benefiting":string,"disrupted":string,"marketGap":string},"unclear":string[],"watchNext":string[],"eventDate":null|"YYYY-MM-DD","keyTerms":string[]}`;
  const r = await route(v, {
    system: `You are WorldLens, a neutral news intelligence analyst.\n${VOICE[tone]}\n${RULES}`,
    prompt: `${sourcesBlock(story, web)}\n\nWrite the full deep dive for this story. entrepreneurLens must be null unless the sources support a real problem or gap (mark inferences as such). ${schema}`,
    json: true,
    big: true,
    grounded: !web.length,
  });
  const data = sanitizeDeep(extractJSON<DeepDive>(r.text));
  const out = { data, provider: `${r.provider} · ${r.model}`, web: web.length ? web : (r.groundingUrls ?? []).map((g) => ({ ...g, snippet: '', source: 'Gemini grounding' })) };
  cacheSet(key, out);
  return { ...out, cached: false, tried: r.tried };
}

export async function askStory(
  v: Vault,
  story: NewsStory | null,
  question: string,
  history: { q: string; a: string }[],
  tone: 'genz' | 'analyst',
) {
  const hist = history.slice(-4).map((h) => `USER: ${h.q}\nYOU: ${h.a}`).join('\n');
  let web: SearchHit[] = [];
  if (hasSearch(v)) {
    try {
      web = (await webSearch(v, story ? `${story.title} ${question}` : question)).slice(0, 5);
    } catch {
      web = [];
    }
  }
  const ctx = story ? sourcesBlock(story, web) : web.length ? sourcesBlock({ sources: [] } as unknown as NewsStory, web) : 'SOURCES: none provided — answer from general knowledge, flag anything time-sensitive as needing verification.';
  const r = await route(v, {
    system: `You are WorldLens's research assistant.\n${VOICE[tone]}\n${RULES}\nCite sources inline like [S1] or [W2].`,
    prompt: `${ctx}\n\n${hist ? 'CONVERSATION SO FAR:\n' + hist + '\n\n' : ''}QUESTION: ${question}`,
    big: true,
    grounded: !web.length,
  });
  let ensembleNote: string | undefined;
  if (v.ensemble && available(v).length > 1) {
    try {
      const second = available(v).find((id) => !r.provider.toLowerCase().includes(id));
      if (second) {
        const check = await callLLM(second, v[second]!, {
          system: 'You fact-check answers strictly against the provided sources. Reply in 1–3 short sentences: "AGREES" or list specific disagreements.',
          prompt: `${ctx}\n\nQUESTION: ${question}\n\nANSWER TO CHECK:\n${r.text}`,
        });
        ensembleNote = `${check.provider} cross-check: ${check.text}`;
      }
    } catch {
      ensembleNote = 'Ensemble cross-check unavailable (second provider failed).';
    }
  }
  return { answer: sanitizeGenZ(r.text), provider: `${r.provider} · ${r.model}`, ensembleNote, web, tried: r.tried };
}

export async function explainConcept(v: Vault, term: string, storyTitle?: string) {
  const key = 'ce:' + hash(term + (storyTitle ?? ''));
  const c = cacheGet<{ text: string; provider: string }>(key, 7 * 86400000);
  if (c) return c;
  const r = await route(v, {
    system: `${VOICE.genz}\nBe accurate. If you mention a company, only use well-known real Indian companies and describe them generally — no invented numbers.`,
    prompt: `Give one concrete Indian business example of "${term}"${storyTitle ? ` that connects to this news: "${storyTitle}"` : ''}. 3–5 sentences.`,
  });
  const out = { text: sanitizeGenZ(r.text), provider: `${r.provider} · ${r.model}` };
  cacheSet(key, out);
  return out;
}

export const FRAME_PRESETS = {
  '17yo Gen-Z Friend': 'Rewrite as if texting a friend who is 17: casual, clear, every term explained, all figures kept.',
  'Startup Founder Pitch Angle': 'Rewrite from a founder’s angle: what problem/opportunity does this create, who pays, what to build — mark inferences.',
  '30-Second Bullet Cheat Sheet': 'Turn into 5–8 ultra-short bullets with every key number and date.',
  'Exam / Policy Brief Notes': 'Rewrite as formal exam/policy-brief notes: Context, Key Facts, Implications, Way Forward.',
} as const;

export async function reframe(v: Vault, story: NewsStory, instruction: string) {
  const r = await route(v, {
    system: `You rewrite news for a personal notebook.\n${RULES}`,
    prompt: `${sourcesBlock(story)}\n\nINSTRUCTION: ${instruction}`,
    big: true,
  });
  return { text: sanitizeGenZ(r.text), provider: `${r.provider} · ${r.model}` };
}

export async function marketGapsFromNews(v: Vault, stories: NewsStory[]): Promise<MarketOpportunity[]> {
  const top = stories.slice(0, 25);
  const key = 'mg:' + hash(top.map((s) => s.id).join(','));
  const c = cacheGet<MarketOpportunity[]>(key, 6 * 3600000);
  if (c) return c;
  const list = top.map((s, i) => `[N${i + 1}] (${s.category}) ${s.title} — ${s.sources[0].publisher} ${s.sources[0].url}`).join('\n');
  const r = await route(v, {
    system: `You find evidence-backed business opportunities in today's news for Indian builders.\n${VOICE.genz}\n${RULES}\nNever suggest generic ideas like "start an AI agency". Each idea must be tied to specific stories by [N#]. Mark validation honestly: PROVEN BUSINESS MODEL only if the story itself shows a working business; EMERGING MODEL if early evidence; otherwise HYPOTHETICAL IDEA. Capital is a bucket only.`,
    prompt: `NEWS:\n${list}\n\nReturn ONLY JSON array (max 6) of {"title","validation","sector","whereWorking","problem","customer","businessModel","whyItWorks","whyNotMainstream","capital":"Very Low|Low|Moderate|High","skills":[],"indiaPotential","competition","risks","evidence":[{"kind":"Evidence|Inference|Speculation","text","ref":"N#"}]}. If there are no real gaps, return [].`,
    json: true,
    big: true,
  });
  type RawGap = Omit<MarketOpportunity, 'evidence' | 'id' | 'origin'> & { evidence?: { kind: string; text: string; ref?: string }[] };
  const arr = sanitizeDeep(extractJSON<RawGap[]>(r.text));
  const out: MarketOpportunity[] = (Array.isArray(arr) ? arr : []).map((m, i) => ({
    ...m,
    id: `ai-${key}-${i}`,
    origin: 'AI_FROM_LIVE_NEWS',
    evidence: (m.evidence ?? []).map((e) => {
      const n = Number(String(e.ref ?? '').replace(/\D/g, ''));
      const s = top[n - 1];
      return { kind: (['Evidence', 'Inference', 'Speculation'].includes(e.kind) ? e.kind : 'Inference') as 'Evidence', text: e.text, url: s?.sources[0].url };
    }),
  }));
  cacheSet(key, out);
  return out;
}

export interface WebLead {
  name: string;
  organization: string;
  url: string;
  deadline: string | null;
  prize: string | null;
  eligibility: string;
  note: string;
}

/** Web hunt for opportunities. Results are ALWAYS shown as UNVERIFIED leads until the user checks the official page. */
export async function huntOpportunities(v: Vault, query: string): Promise<{ leads: WebLead[]; provider: string }> {
  const hits = await webSearch(v, `${query} applications open 2026 OR 2027 deadline`, false);
  if (!hits.length) return { leads: [], provider: 'no search results' };
  const r = await route(v, {
    system: `Extract real opportunity listings from search results. ${RULES} If deadline or prize is not in the snippet, use null. Never guess.`,
    prompt: `SEARCH RESULTS:\n${hits.map((h, i) => `[W${i + 1}] ${h.title} | ${h.url}\n${h.snippet}`).join('\n\n')}\n\nReturn ONLY JSON array of {"name","organization","url","deadline":null|"as written","prize":null|"as written","eligibility","note"}.`,
    json: true,
  });
  const leads = extractJSON<WebLead[]>(r.text);
  return { leads: Array.isArray(leads) ? sanitizeDeep(leads) : [], provider: `${r.provider} · ${r.model}` };
}
