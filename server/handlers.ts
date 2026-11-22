/**
 * Option B (self-hosted / deployed) server handlers.
 * Keys live ONLY in server environment variables — never in the client bundle.
 * Used by: Vite dev + preview middleware (vite.config.ts) and Vercel functions (api/*.ts).
 */
import { callLLM, callSearch, type LLMId, type LLMRequest } from '../src/ai/providers';

const ALLOW = [
  'api.gdeltproject.org',
  'pib.gov.in',
  'www.rbi.org.in',
  'rbi.org.in',
  'www.sebi.gov.in',
  'news.google.com',
  'www.thehindu.com',
  'devpost.com',
  'hn.algolia.com',
  'content.guardianapis.com',
  'newsdata.io',
];

const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string, max = 120, windowMs = 60000) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > windowMs) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n++;
  return h.n > max;
}

const cache = new Map<string, { at: number; body: string; type: string }>();

export interface Reply {
  status: number;
  type: string;
  body: string;
}

export async function handleProxy(target: string | null, ip = 'local'): Promise<Reply> {
  if (rateLimited(ip)) return { status: 429, type: 'text/plain', body: 'rate limited' };
  if (!target) return { status: 400, type: 'text/plain', body: 'missing url' };
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return { status: 400, type: 'text/plain', body: 'invalid url' };
  }
  if (u.protocol !== 'https:' || !ALLOW.includes(u.hostname))
    return { status: 403, type: 'text/plain', body: `host not allowed: ${u.hostname}` };
  const c = cache.get(u.toString());
  if (c && Date.now() - c.at < 5 * 60000) return { status: 200, type: c.type, body: c.body };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'WorldLens/1.0 (+news reader)' } });
    const body = await res.text();
    const type = res.headers.get('content-type') ?? 'text/plain';
    if (res.ok) cache.set(u.toString(), { at: Date.now(), body, type });
    return { status: res.status, type, body };
  } catch (e) {
    return { status: 502, type: 'text/plain', body: `upstream error: ${(e as Error).message}` };
  } finally {
    clearTimeout(t);
  }
}

function envKeys(): Partial<Record<LLMId, string>> {
  return {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
}

export async function handleAI(bodyText: string, ip = 'local'): Promise<Reply> {
  if (rateLimited('ai:' + ip, 30)) return { status: 429, type: 'text/plain', body: 'rate limited' };
  let req: LLMRequest;
  try {
    req = JSON.parse(bodyText);
    if (typeof req.prompt !== 'string' || typeof req.system !== 'string') throw new Error();
    if (req.prompt.length > 60000) return { status: 413, type: 'text/plain', body: 'prompt too large' };
  } catch {
    return { status: 400, type: 'text/plain', body: 'invalid body' };
  }
  const keys = envKeys();
  const order = (process.env.LLM_ORDER ?? 'gemini,groq,openrouter').split(',') as LLMId[];
  const errors: string[] = [];
  for (const id of order) {
    const k = keys[id];
    if (!k) continue;
    try {
      const r = await callLLM(id, k, req);
      return { status: 200, type: 'application/json', body: JSON.stringify(r) };
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  return { status: 503, type: 'text/plain', body: errors.length ? errors.join(' | ') : 'no server LLM keys configured' };
}

export async function handleSearch(q: string | null, news: boolean): Promise<Reply> {
  if (!q) return { status: 400, type: 'text/plain', body: 'missing q' };
  try {
    if (process.env.TAVILY_API_KEY) return json(await callSearch('tavily', process.env.TAVILY_API_KEY, q, news));
    if (process.env.SERPER_API_KEY) return json(await callSearch('serper', process.env.SERPER_API_KEY, q, news));
    return { status: 503, type: 'text/plain', body: 'no search key configured' };
  } catch (e) {
    return { status: 502, type: 'text/plain', body: (e as Error).message };
  }
}

function json(v: unknown): Reply {
  return { status: 200, type: 'application/json', body: JSON.stringify(v) };
}
