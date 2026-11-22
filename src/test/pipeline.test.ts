import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runIngestion } from '../adapters';
import { clearHttpCache } from '../adapters/http';
import { DEFAULT_VAULT } from '../lib/storage';
import { installFetchMock, NOW } from './fixtures';
import { route, NoProviderError, askStory } from '../ai/router';
import { mergeArticles } from '../lib/cluster';

beforeEach(() => {
  clearHttpCache();
  localStorage.clear();
});

describe('ingestion pipeline', () => {
  it('fetches, rejects bad timestamps, clusters across adapters and reports health', async () => {
    installFetchMock();
    const r = await runIngestion([], DEFAULT_VAULT, 'Asia/Kolkata', [], () => undefined, NOW);
    const rbi = r.stories.find((s) => s.title.startsWith('RBI keeps repo rate'))!;
    expect(rbi.sources.map((s) => s.publisher).sort()).toEqual(['Mint', 'Reserve Bank of India']);
    expect(rbi.confidence).toBe('VERIFIED'); // official source present
    expect(r.rejected.map((x) => x.reason).sort()).toEqual(['future', 'missing']);
    expect(r.stories.some((s) => s.title.includes('Future-dated'))).toBe(false);
    expect(r.health.find((h) => h.adapter === 'rbi')!.status).toBe('HEALTHY');
    expect(r.health.find((h) => h.adapter === 'pib')!.status).toBe('DEGRADED');
    expect(r.health.find((h) => h.adapter === 'guardian')!.status).toBe('NEEDS_KEY');
    // GDELT timestamps are labelled first-seen, not "published"
    expect(r.stories.find((s) => s.title.includes('Hindi LLM'))!.sources[0].timestampKind).toBe('first-seen');
  });
  it('survives an adapter outage without fabricating data', async () => {
    installFetchMock({ failGdelt: true });
    const r = await runIngestion([], DEFAULT_VAULT, 'Asia/Kolkata', [], () => undefined, NOW);
    expect(r.health.find((h) => h.adapter === 'gdelt')!.status).toBe('DEGRADED');
    expect(r.stories.some((s) => s.title.includes('Hindi LLM'))).toBe(false);
    expect(r.stories.length).toBeGreaterThan(0);
  });
  it('falls back through proxy routes when direct fetch is blocked (CORS)', async () => {
    const { calls } = installFetchMock();
    await runIngestion([], DEFAULT_VAULT, 'Asia/Kolkata', [], () => undefined, NOW);
    expect(calls.some((c) => c.startsWith('/api/proxy?url=') && c.includes('rbi.org.in'))).toBe(true);
    expect(calls.some((c) => c.includes('allorigins') && c.includes('pib.gov.in'))).toBe(true);
  });
  it('re-polling is idempotent (no duplicate stories)', async () => {
    installFetchMock();
    const a = await runIngestion([], DEFAULT_VAULT, 'Asia/Kolkata', [], () => undefined, NOW);
    clearHttpCache();
    const b = await runIngestion(a.stories, DEFAULT_VAULT, 'Asia/Kolkata', [], () => undefined, NOW);
    expect(b.stories).toHaveLength(a.stories.length);
    expect(b.added).toBe(0);
  });
  it('respects disabled adapters', async () => {
    const { calls } = installFetchMock();
    await runIngestion([], DEFAULT_VAULT, 'Asia/Kolkata', ['gdelt', 'devpost'], () => undefined, NOW);
    expect(calls.some((c) => c.includes('gdeltproject'))).toBe(false);
  });
});

describe('AI router fallback', () => {
  it('throws a clear error when no provider is configured', async () => {
    await expect(route(DEFAULT_VAULT, { system: 's', prompt: 'p' })).rejects.toBeInstanceOf(NoProviderError);
  });
  it('falls back from a failing provider to the next one and sanitizes output', async () => {
    globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes('generativelanguage')) return new Response('quota', { status: 429 });
      if (url.includes('groq.com'))
        return new Response(JSON.stringify({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'A comprehensive ecosystem answer.' } }] }), { status: 200 });
      return new Response('x', { status: 404 });
    }) as unknown as typeof fetch;
    const v = { ...DEFAULT_VAULT, gemini: 'g', groq: 'q' };
    const story = mergeArticles([], [{ title: 'Test story', url: 'https://a/1', publisher: 'A', publishedAtISO: NOW.toISOString(), sourceType: 'news', credibilityTier: 4, adapter: 't' }], 'Asia/Kolkata', NOW).stories[0];
    const r = await askStory(v, story, 'what?', [], 'genz');
    expect(r.provider).toContain('Groq');
    expect(r.tried[0]).toMatch(/^gemini ✗/);
    expect(r.answer).toBe('A whole-picture community answer.');
  });
});
