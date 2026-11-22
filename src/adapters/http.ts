import { DEFAULTS } from '../config';

export interface FetchResult {
  text: string;
  route: string;
}

export interface HttpOptions {
  /** Try direct browser fetch first (APIs that send CORS headers). */
  direct?: boolean;
  /** Allow same-origin server proxy (/api/proxy) — present in dev server and Vercel/Netlify deploys. */
  serverProxy?: boolean;
  /** Allow public CORS relays as last resort (zero-install mode). */
  relays?: boolean;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const memo = new Map<string, { at: number; text: string; route: string }>();
const CACHE_MS = 4 * 60 * 1000;

async function withTimeout(url: string, ms: number, headers?: Record<string, string>): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resilient text fetch with route fallback: direct → /api/proxy → public relays.
 * Short in-memory cache prevents duplicate calls within a poll burst.
 */
export async function fetchText(url: string, opts: HttpOptions = {}): Promise<FetchResult> {
  const { direct = true, serverProxy = true, relays = true, timeoutMs = 15000, retries = 1, headers } = opts;
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return { text: hit.text, route: hit.route + ' (cached)' };

  const routes: { name: string; url: string }[] = [];
  if (direct) routes.push({ name: 'direct', url });
  if (serverProxy) routes.push({ name: 'server-proxy', url: `/api/proxy?url=${encodeURIComponent(url)}` });
  if (relays) DEFAULTS.corsRelays.forEach((r, i) => routes.push({ name: `relay-${i + 1}`, url: r + encodeURIComponent(url) }));

  const errors: string[] = [];
  for (const r of routes) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await withTimeout(r.url, timeoutMs, r.name === 'direct' ? headers : undefined);
        if (res.status === 429) throw new Error('rate-limited (429)');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // the dev server returns index.html for unknown routes when no proxy exists
        if (r.name === 'server-proxy' && /^\s*<!doctype html/i.test(text) && !/<rss|<feed/i.test(text))
          throw new Error('no server proxy here');
        memo.set(url, { at: Date.now(), text, route: r.name });
        return { text, route: r.name };
      } catch (e) {
        const msg = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : String(e);
        errors.push(`${r.name}: ${msg}`);
        if (msg.startsWith('HTTP 4') && msg !== 'HTTP 408') break; // don't retry client errors
      }
    }
  }
  throw new Error(errors.slice(-3).join(' | ') || 'all routes failed');
}

export async function fetchJSON<T = unknown>(url: string, opts: HttpOptions = {}): Promise<{ data: T; route: string }> {
  const r = await fetchText(url, opts);
  try {
    return { data: JSON.parse(r.text) as T, route: r.route };
  } catch {
    throw new Error('invalid JSON from source');
  }
}

export function clearHttpCache() {
  memo.clear();
}
