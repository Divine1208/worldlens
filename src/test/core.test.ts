import { describe, expect, it } from 'vitest';
import { validateArticleTimestamp, parseTimestamp } from '../lib/timestamps';
import { mergeArticles, tokenize, type AcceptedArticle } from '../lib/cluster';
import { bucketByHour, splitByCycle, didRollover } from '../lib/lifecycle';
import { dateKey, hourOf, nextMidnight, msUntilMidnight } from '../lib/time';
import { activeOpportunities, computeStatus, daysRemaining, filterOpportunities, EMPTY_FILTERS, discoveryScore } from '../lib/opportunities';
import { sanitizeGenZ, containsBanned, sanitizeDeep } from '../lib/genz';
import { parseDevpostRange, parseDevpost } from '../adapters/devpost';
import { parseFeed } from '../adapters/rss';
import { CURATED_OPPORTUNITIES } from '../data/opportunities';
import { CONCEPTS } from '../data/concepts';
import { CURATED_MARKET_MODELS } from '../data/marketModels';
import { detectConcepts } from '../lib/conceptDetect';
import type { GlobalOpportunity } from '../types';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-11-23T05:30:00Z'); // 11:00 IST, 23 Nov 2026

const art = (title: string, url: string, iso: string, publisher = 'Mint', tier: AcceptedArticle['credibilityTier'] = 4): AcceptedArticle => ({
  title,
  url,
  publisher,
  publishedAtRaw: iso,
  publishedAtISO: iso,
  sourceType: 'news',
  credibilityTier: tier,
  adapter: 'test',
});

describe('timestamp validator', () => {
  it('accepts a normal RFC-822 pubDate', () => {
    const v = validateArticleTimestamp('Mon, 23 Nov 2026 04:10:00 GMT', NOW);
    expect(v.ok).toBe(true);
    expect(v.iso).toBe('2026-11-23T04:10:00.000Z');
  });
  it('parses GDELT compact seendate', () => {
    expect(parseTimestamp('20261123T041500Z')?.toISOString()).toBe('2026-11-23T04:15:00.000Z');
  });
  it('rejects future-dated items beyond 10 minutes', () => {
    expect(validateArticleTimestamp('2026-11-23T05:45:00Z', NOW)).toMatchObject({ ok: false, reason: 'future' });
    expect(validateArticleTimestamp('2026-11-24T01:00:00Z', NOW).reason).toBe('future');
  });
  it('tolerates small clock skew (<10 min)', () => {
    expect(validateArticleTimestamp('2026-11-23T05:35:00Z', NOW).ok).toBe(true);
  });
  it('rejects missing, malformed, date-only and stale timestamps — never substitutes today', () => {
    expect(validateArticleTimestamp(undefined, NOW).reason).toBe('missing');
    expect(validateArticleTimestamp('', NOW).reason).toBe('missing');
    expect(validateArticleTimestamp('yesterday-ish', NOW).reason).toBe('malformed');
    expect(validateArticleTimestamp('2026-11-23', NOW).reason).toBe('malformed');
    expect(validateArticleTimestamp('2025-01-01T00:00:00Z', NOW).reason).toBe('stale');
  });
  it('handles unix seconds (HN) and NewsData zone-less format as UTC', () => {
    expect(validateArticleTimestamp(1795410000, NOW).ok).toBe(true);
    expect(parseTimestamp('2026-11-23 04:00:00')?.toISOString()).toBe('2026-11-23T04:00:00.000Z');
  });
});

describe('dedup + clustering', () => {
  it('deduplicates identical URLs (incl. utm junk) and clusters similar headlines', () => {
    const a = [
      art('RBI keeps repo rate unchanged at 5.5%, MPC votes 6-0 - Mint', 'https://mint.com/a?utm_source=x', '2026-11-23T04:00:00Z'),
      art('RBI keeps repo rate unchanged at 5.5% MPC votes 6-0', 'https://mint.com/a', '2026-11-23T04:00:00Z'),
      art('RBI keeps repo rate unchanged at 5.5% as MPC votes 6-0 - The Hindu', 'https://thehindu.com/b', '2026-11-23T04:20:00Z', 'The Hindu'),
      art('Nvidia unveils new chip for data centres', 'https://x.com/c', '2026-11-23T03:00:00Z', 'Reuters'),
    ];
    const r = mergeArticles([], a, TZ, NOW);
    expect(r.duplicates).toBe(1);
    expect(r.stories).toHaveLength(2);
    const rbi = r.stories.find((s) => s.title.includes('RBI'))!;
    expect(rbi.sources).toHaveLength(2);
    // earliest publication preserved, latest = updated
    expect(rbi.publishedAt).toBe('2026-11-23T04:00:00Z');
    expect(rbi.updatedAt).toBe('2026-11-23T04:20:00Z');
    expect(rbi.status).toBe('NEW');
  });
  it('marks a story UPDATED when a later poll adds a new source, without touching original dates', () => {
    const first = mergeArticles([], [art('SEBI tightens F&O rules for retail traders', 'https://a.com/1', '2026-11-23T02:00:00Z')], TZ, new Date('2026-11-23T03:00:00Z'));
    const second = mergeArticles(first.stories, [art('SEBI tightens F&O rules for retail traders, sets new limits', 'https://b.com/2', '2026-11-23T04:30:00Z', 'ET')], TZ, NOW);
    const s = second.stories[0];
    expect(second.stories).toHaveLength(1);
    expect(s.status).toBe('UPDATED');
    expect(s.publishedAt).toBe('2026-11-23T02:00:00Z');
    expect(s.collectedAt).toBe('2026-11-23T03:00:00.000Z');
  });
  it('does not merge unrelated stories', () => {
    expect(tokenize('Budget 2027: what changes for salaried taxpayers')).not.toEqual(tokenize('India beats Australia in third ODI'));
    const r = mergeArticles([], [art('Budget changes income tax slabs', 'https://a/1', '2026-11-23T01:00:00Z'), art('India beats Australia in ODI', 'https://a/2', '2026-11-23T01:00:00Z')], TZ, NOW);
    expect(r.stories).toHaveLength(2);
  });
  it('marks multi-day clusters ONGOING and 3+ publishers verified', () => {
    const r = mergeArticles(
      [],
      [
        art('Ceasefire talks resume in Geneva', 'https://a/1', '2026-11-22T10:00:00Z', 'Reuters'),
        art('Ceasefire talks resume in Geneva today', 'https://b/1', '2026-11-23T01:00:00Z', 'BBC'),
        art('Ceasefire talks resume in Geneva amid pressure', 'https://c/1', '2026-11-23T02:00:00Z', 'AP'),
      ],
      TZ,
      NOW,
    );
    expect(r.stories[0].status).toBe('ONGOING');
    expect(r.stories[0].confidence).toBe('VERIFIED');
  });
});

describe('IST hourly lifecycle & midnight rollover', () => {
  it('buckets by IST hour, not UTC', () => {
    // 19:00 UTC on 22 Nov = 00:30 IST on 23 Nov
    expect(dateKey('2026-11-22T19:00:00Z', TZ)).toBe('2026-11-23');
    expect(hourOf('2026-11-22T19:00:00Z', TZ)).toBe(0);
    expect(hourOf('2026-11-23T05:29:00Z', TZ)).toBe(10);
  });
  it('produces reverse-chronological windows down to 00:00 incl. quiet hours', () => {
    const r = mergeArticles([], [art('Quiet morning story about GST council', 'https://a/1', '2026-11-22T19:00:00Z')], TZ, NOW);
    const { todayStories } = splitByCycle(r.stories, NOW, TZ);
    const b = bucketByHour(todayStories, NOW, TZ);
    expect(b[0].hour).toBe(11);
    expect(b[b.length - 1].hour).toBe(0);
    expect(b).toHaveLength(12);
    expect(b.find((x) => x.hour === 0)!.stories).toHaveLength(1);
    expect(b.find((x) => x.hour === 5)!.stories).toHaveLength(0); // quiet hour kept, not filled
  });
  it('rolls yesterday into the archive at IST midnight without deleting anything', () => {
    const stories = mergeArticles(
      [],
      [art('Late night PIB release on PLI scheme', 'https://pib/1', '2026-11-23T18:20:00Z', 'PIB', 1), art('Morning markets open higher Sensex', 'https://x/2', '2026-11-23T04:00:00Z')],
      TZ,
      new Date('2026-11-23T18:25:00Z'),
    ).stories;
    const before = new Date('2026-11-23T18:29:00Z'); // 23:59 IST
    const after = new Date('2026-11-23T18:31:00Z'); // 00:01 IST next day
    expect(splitByCycle(stories, before, TZ).todayStories).toHaveLength(2);
    const s2 = splitByCycle(stories, after, TZ);
    expect(s2.today).toBe('2026-11-24');
    expect(s2.todayStories).toHaveLength(0);
    expect(s2.archive).toHaveLength(2);
    expect(s2.archive.every((s) => s.origin === 'ARCHIVE_RECORD')).toBe(true);
    expect(didRollover('2026-11-23', after, TZ)).toBe(true);
  });
  it('computes next IST midnight correctly', () => {
    expect(nextMidnight(NOW, TZ).toISOString()).toBe('2026-11-23T18:30:00.000Z');
    expect(msUntilMidnight(NOW, TZ)).toBe(13 * 3600000);
  });
});

describe('opportunity engine', () => {
  const base = CURATED_OPPORTUNITIES[0];
  const mk = (p: Partial<GlobalOpportunity>): GlobalOpportunity => ({ ...base, rolling: false, announced: true, ...p });
  it('excludes CLOSED (deadline passed) from active lists and searches', () => {
    const closed = mk({ id: 'c', deadlineISO: '2026-11-01T23:59:00Z' });
    const open = mk({ id: 'o', deadlineISO: '2026-12-31T23:59:00Z' });
    expect(computeStatus(closed, NOW)).toBe('CLOSED');
    expect(activeOpportunities([closed, open], NOW).map((o) => o.id)).toEqual(['o']);
    expect(filterOpportunities([closed, open], { ...EMPTY_FILTERS, q: base.name }, NOW, TZ).map((o) => o.id)).toEqual(['o']);
  });
  it('derives APPLY_NOW / PREPARE_NOW / WATCH honestly', () => {
    expect(computeStatus(mk({ openingDate: '2027-01-10T00:00:00Z', deadlineISO: null }), NOW)).toBe('PREPARE_NOW');
    expect(computeStatus(mk({ announced: false, deadlineISO: null }), NOW)).toBe('WATCH');
    expect(computeStatus(mk({ rolling: true, deadlineISO: null }), NOW)).toBe('APPLY_NOW');
  });
  it('counts days remaining in the user timezone', () => {
    // deadline 6 Dec 23:59 PST = 7 Dec 13:29 IST → 14 IST calendar days from 23 Nov
    expect(daysRemaining('2026-12-06T23:59:00-08:00', NOW, TZ)).toBe(14);
    // 18:00Z = 23:30 IST today (0 days) but 10:00 tomorrow in LA, where it is still 22 Nov (1 day)
    expect(daysRemaining('2026-11-23T18:00:00Z', NOW, TZ)).toBe(0);
    expect(daysRemaining('2026-11-23T18:00:00Z', NOW, 'America/Los_Angeles')).toBe(1);
    expect(daysRemaining(null, NOW, TZ)).toBeNull();
  });
  it('filters idea-stage + India-eligible, and ranks zero-equity above equity', () => {
    const res = filterOpportunities(CURATED_OPPORTUNITIES, { ...EMPTY_FILTERS, stage: 'Idea', eligibility: 'india' }, NOW, TZ);
    expect(res.length).toBeGreaterThan(2);
    expect(res.every((o) => o.stage === 'Idea' && o.indiansEligible === 'Yes')).toBe(true);
    const yc = CURATED_OPPORTUNITIES.find((o) => o.id === 'yc-next')!;
    const thiel = CURATED_OPPORTUNITIES.find((o) => o.id === 'thiel-fellowship')!;
    expect(discoveryScore(thiel, NOW, TZ)).toBeGreaterThan(discoveryScore(yc, NOW, TZ));
  });
  it('curated data: every record has all 21 fields, a URL, and no fabricated deadline', () => {
    for (const o of CURATED_OPPORTUNITIES) {
      expect(o.name && o.organization && o.country && o.category && o.vibe && o.whoCanParticipate).toBeTruthy();
      expect(o.officialUrl).toMatch(/^https:\/\//);
      expect(o.evidence.length).toBeGreaterThan(0);
      expect(o.submission.length).toBeGreaterThan(0);
      expect(o.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (!o.deadlineISO) expect(o.rolling || o.deadlineNote).toBeTruthy();
      if (o.takesEquity) expect(o.fundingType).not.toBe('Grant');
    }
  });
});

describe('17yo Gen Z plain-English sanitizer', () => {
  it('replaces every banned corporate word, preserving capitalisation', () => {
    const s = sanitizeGenZ('A comprehensive plan: Infrastructure synergy will pivot the ecosystem to a new paradigm with fiduciary care.');
    expect(containsBanned(s)).toEqual([]);
    expect(s).toBe('A whole-picture plan: Setup teaming up will switch up the community to a new vibe with money-rules care.');
  });
  it('sanitizes nested AI JSON', () => {
    expect(sanitizeDeep({ a: ['startup ecosystem'], b: { c: 'They pivoted fast' } })).toEqual({ a: ['startup community'], b: { c: 'They switched up fast' } });
  });
  it('built-in copy (concepts, market models) is free of banned words', () => {
    const text = JSON.stringify(CONCEPTS.map((c) => [c.simple, c.analogy, c.whyItMatters])) + JSON.stringify(CURATED_MARKET_MODELS);
    expect(containsBanned(text)).toEqual([]);
  });
});

describe('parsers', () => {
  it('parses RSS with <source> publisher (Google News style)', () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Feed</title><item><title>Rupee hits record low - Reuters</title><link>https://n.g/1</link><pubDate>Mon, 23 Nov 2026 03:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source><description>&lt;a&gt;Rupee&lt;/a&gt; falls</description></item></channel></rss>`;
    const items = parseFeed(xml, { adapter: 'gn', sourceType: 'news', credibilityTier: 4 });
    expect(items[0]).toMatchObject({ publisher: 'Reuters', url: 'https://n.g/1', publishedAtRaw: 'Mon, 23 Nov 2026 03:00:00 GMT' });
    expect(items[0].summary).toBe('Rupee falls');
  });
  it('parses Atom feeds', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry><title>Launch</title><link href="https://b/1"/><updated>2026-11-23T01:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml, { adapter: 'a', sourceType: 'company', credibilityTier: 2 })[0].url).toBe('https://b/1');
  });
  it('parses Devpost date ranges', () => {
    expect(parseDevpostRange('Nov 01 - Dec 15, 2026')).toEqual({ start: '2026-11-01', end: '2026-12-15' });
    expect(parseDevpostRange('Dec 01 - 15, 2026')).toEqual({ start: '2026-12-01', end: '2026-12-15' });
    expect(parseDevpostRange('Dec 20, 2026 - Jan 10, 2027')).toEqual({ start: '2026-12-20', end: '2027-01-10' });
    expect(parseDevpostRange('Dec 20 - Jan 10, 2027')).toEqual({ start: '2026-12-20', end: '2027-01-10' });
    const o = parseDevpost({ hackathons: [{ id: 1, title: 'Build AI', url: 'https://x.devpost.com', submission_period_dates: 'Nov 01 - Dec 15, 2026', prize_amount: '$<span>10,000</span>', open_state: 'open', displayed_location: { location: 'Online' } }] }, NOW);
    expect(o[0].prizeUSD).toBe(10000);
    expect(o[0].deadlineISO).toBe('2026-12-15T23:59:00Z');
  });
  it('detects concepts, ignoring lower-case acronym false positives', () => {
    expect(detectConcepts('RBI holds repo rate; CPI inflation eases')).toEqual(expect.arrayContaining(['RBI', 'Repo Rate', 'CPI', 'Inflation']));
    expect(detectConcepts('a fabulous gpu-free ipo party')).not.toContain('IPO');
  });
});
