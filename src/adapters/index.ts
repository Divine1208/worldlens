import type { AdapterHealth, GlobalOpportunity, IngestionLogLine, NewsStory, RawArticle, RejectedItem, Vault } from '../types';
import { fetchJSON, fetchText } from './http';
import { parseFeed, stripHtml } from './rss';
import { validateArticleTimestamp } from '../lib/timestamps';
import { mergeArticles, type AcceptedArticle } from '../lib/cluster';
import { parseDevpost } from './devpost';

export interface AdapterContext {
  vault: Vault;
  now: Date;
}

export interface SourceAdapter {
  id: string;
  label: string;
  tier: string; // free/paid description for the health matrix
  needsKey?: keyof Vault;
  fetch(ctx: AdapterContext): Promise<{ items: RawArticle[]; route: string }>;
}

const rssAdapter = (
  id: string,
  label: string,
  url: string,
  meta: Omit<Parameters<typeof parseFeed>[1], 'adapter'>,
  tier = 'Free public RSS',
): SourceAdapter => ({
  id,
  label,
  tier,
  async fetch() {
    const r = await fetchText(url, { direct: false });
    return { items: parseFeed(r.text, { ...meta, adapter: id }), route: r.route };
  },
});

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&hl=en-IN&gl=IN&ceid=IN:en`;

export const NEWS_ADAPTERS: SourceAdapter[] = [
  {
    id: 'gdelt',
    label: 'GDELT DOC 2.0',
    tier: '100% free · updates every 15 min · first-seen timestamps',
    async fetch() {
      const q = '(India OR RBI OR SEBI OR "Indian economy" OR startup OR "artificial intelligence") sourcelang:english';
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=120&timespan=24h&sort=datedesc`;
      const { data, route } = await fetchJSON<{ articles?: { url: string; title: string; seendate: string; domain: string; sourcecountry?: string }[] }>(url);
      const items: RawArticle[] = (data.articles ?? []).map((a) => ({
        title: a.title,
        url: a.url,
        publisher: a.domain,
        publishedAtRaw: a.seendate,
        sourceType: 'aggregator',
        credibilityTier: 4,
        adapter: 'gdelt',
        timestampKind: 'first-seen',
      }));
      return { items, route };
    },
  },
  rssAdapter('pib', 'PIB Press Releases', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', {
    publisher: 'Press Information Bureau (PIB)',
    sourceType: 'official',
    credibilityTier: 1,
    categoryHint: 'india',
  }, 'Free official RSS · real-time on release'),
  rssAdapter('rbi', 'RBI Press Releases', 'https://www.rbi.org.in/pressreleases_rss.xml', {
    publisher: 'Reserve Bank of India',
    sourceType: 'official',
    credibilityTier: 1,
    categoryHint: 'india',
  }, 'Free official RSS'),
  rssAdapter('sebi', 'SEBI Updates', 'https://www.sebi.gov.in/sebirss.xml', {
    publisher: 'SEBI',
    sourceType: 'official',
    credibilityTier: 1,
    categoryHint: 'markets',
  }, 'Free official RSS'),
  rssAdapter('gn-india', 'Google News — India', gnews('India government OR policy OR economy OR Parliament'), {
    sourceType: 'news',
    credibilityTier: 4,
    categoryHint: 'india',
  }, 'Free RSS (gl=IN) · 5–15 min'),
  rssAdapter('gn-world', 'Google News — World', gnews('geopolitics OR diplomacy OR sanctions OR tariffs OR war'), {
    sourceType: 'news',
    credibilityTier: 4,
    categoryHint: 'world',
  }),
  rssAdapter('gn-markets', 'Google News — Markets', gnews('Sensex OR Nifty OR rupee OR bond yields OR FPI'), {
    sourceType: 'news',
    credibilityTier: 4,
    categoryHint: 'markets',
  }),
  rssAdapter('gn-startups', 'Google News — Startups', gnews('Indian startup raises OR funding round OR acquires'), {
    sourceType: 'news',
    credibilityTier: 4,
    categoryHint: 'startups',
  }),
  rssAdapter('gn-ai', 'Google News — AI & Tech', gnews('AI model OR semiconductor OR MeitY OR IndiaAI'), {
    sourceType: 'news',
    credibilityTier: 4,
    categoryHint: 'ai-tech',
  }),
  rssAdapter('thehindu-biz', 'The Hindu — Business', 'https://www.thehindu.com/business/feeder/default.rss', {
    publisher: 'The Hindu',
    sourceType: 'news',
    credibilityTier: 4,
  }),
  {
    id: 'hn',
    label: 'Hacker News (Algolia)',
    tier: '100% free · 10,000 req/hr · real-time',
    async fetch({ now }) {
      const since = Math.floor(now.getTime() / 1000) - 86400;
      const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i>${since},points>40&hitsPerPage=60`;
      const { data, route } = await fetchJSON<{ hits: { title: string; url?: string; objectID: string; created_at_i: number; points: number; author: string }[] }>(url, { serverProxy: false, relays: false });
      const items: RawArticle[] = data.hits
        .filter((h) => h.title)
        .map((h) => ({
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          publisher: h.url ? new URL(h.url).hostname.replace(/^www\./, '') + ' (via HN)' : 'Hacker News',
          publishedAtRaw: h.created_at_i,
          author: h.author,
          sourceType: 'community',
          credibilityTier: 6,
          adapter: 'hn',
          categoryHint: 'ai-tech',
          summary: `Discovery signal: ${h.points} points on Hacker News. Community posts are not verified facts.`,
        }));
      return { items, route };
    },
  },
  {
    id: 'guardian',
    label: 'The Guardian Open Platform',
    tier: 'Free key · 500 calls/day',
    needsKey: 'guardian',
    async fetch({ vault, now }) {
      const from = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      const url = `https://content.guardianapis.com/search?api-key=${vault.guardian}&order-by=newest&page-size=50&from-date=${from}&section=world|business|technology|global-development&show-fields=trailText,lastModified,byline`;
      const { data, route } = await fetchJSON<{ response: { results: { webTitle: string; webUrl: string; webPublicationDate: string; sectionId: string; fields?: { trailText?: string; lastModified?: string; byline?: string } }[] } }>(url, { serverProxy: false, relays: false });
      return {
        route,
        items: data.response.results.map((r) => ({
          title: r.webTitle,
          url: r.webUrl,
          publisher: 'The Guardian',
          publishedAtRaw: r.webPublicationDate,
          updatedAtRaw: r.fields?.lastModified,
          summary: stripHtml(r.fields?.trailText ?? ''),
          author: r.fields?.byline,
          sourceType: 'news',
          credibilityTier: 4,
          adapter: 'guardian',
          categoryHint: r.sectionId === 'technology' ? 'ai-tech' : r.sectionId === 'business' ? 'markets' : 'world',
        })),
      };
    },
  },
  {
    id: 'newsdata',
    label: 'NewsData.io',
    tier: 'Free 200 credits/day (delayed) · paid real-time from $199/mo',
    needsKey: 'newsdata',
    async fetch({ vault }) {
      const url = `https://newsdata.io/api/1/latest?apikey=${vault.newsdata}&country=in&language=en`;
      const { data, route } = await fetchJSON<{ results?: { title: string; link: string; source_name?: string; source_id: string; pubDate: string; description?: string; creator?: string[] }[] }>(url, { serverProxy: false, relays: false });
      return {
        route,
        items: (data.results ?? []).map((r) => ({
          title: r.title,
          url: r.link,
          publisher: r.source_name || r.source_id,
          publishedAtRaw: r.pubDate,
          summary: r.description?.slice(0, 500),
          author: r.creator?.[0],
          sourceType: 'news',
          credibilityTier: 4,
          adapter: 'newsdata',
        })),
      };
    },
  },
];

export const DEVPOST_ADAPTER = {
  id: 'devpost',
  label: 'Devpost — open hackathons',
  async fetch(now: Date) {
    const { data, route } = await fetchJSON<unknown>('https://devpost.com/api/hackathons?status[]=open&order_by=deadline&per_page=40', {
      direct: false,
    });
    return { items: parseDevpost(data, now), route };
  },
};

export interface IngestionResult {
  stories: NewsStory[];
  health: AdapterHealth[];
  rejected: RejectedItem[];
  log: IngestionLogLine[];
  added: number;
  updated: number;
  liveOpps?: GlobalOpportunity[];
}

/**
 * The ingestion pipeline: fetch → normalise → validate timestamps → dedupe/cluster → merge.
 * Every adapter failure is recorded; nothing is fabricated to fill gaps.
 */
export async function runIngestion(
  existing: NewsStory[],
  vault: Vault,
  tz: string,
  disabled: string[],
  onLog: (l: IngestionLogLine) => void,
  now: Date = new Date(),
): Promise<IngestionResult> {
  const log: IngestionLogLine[] = [];
  const push = (level: IngestionLogLine['level'], msg: string) => {
    const l = { at: new Date().toISOString(), level, msg };
    log.push(l);
    onLog(l);
  };
  const health: AdapterHealth[] = [];
  const rejected: RejectedItem[] = [];
  const accepted: AcceptedArticle[] = [];

  await Promise.all(
    NEWS_ADAPTERS.map(async (ad) => {
      if (disabled.includes(ad.id)) {
        health.push({ adapter: ad.id, label: ad.label, status: 'DISABLED', fetched: 0, accepted: 0, rejected: 0 });
        return;
      }
      if (ad.needsKey && !vault[ad.needsKey]) {
        health.push({ adapter: ad.id, label: ad.label, status: 'NEEDS_KEY', fetched: 0, accepted: 0, rejected: 0 });
        return;
      }
      push('info', `→ ${ad.label}: fetching…`);
      try {
        const { items, route } = await ad.fetch({ vault, now });
        let ok = 0,
          bad = 0;
        for (const it of items) {
          const v = validateArticleTimestamp(it.publishedAtRaw, now);
          if (!v.ok) {
            bad++;
            rejected.push({ title: it.title, adapter: ad.id, reason: v.reason!, raw: v.detail ?? String(it.publishedAtRaw ?? ''), at: now.toISOString() });
            continue;
          }
          const upd = it.updatedAtRaw ? validateArticleTimestamp(it.updatedAtRaw, now) : null;
          accepted.push({ ...it, publishedAtISO: v.iso!, updatedAtISO: upd?.ok ? upd.iso : undefined });
          ok++;
        }
        push(bad ? 'warn' : 'info', `✓ ${ad.label}: ${items.length} fetched via ${route}, ${ok} accepted, ${bad} rejected by timestamp validator`);
        health.push({ adapter: ad.id, label: ad.label, status: 'HEALTHY', fetched: items.length, accepted: ok, rejected: bad, route, checkedAt: now.toISOString() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        push('error', `✗ ${ad.label}: ${msg}`);
        health.push({ adapter: ad.id, label: ad.label, status: 'DEGRADED', fetched: 0, accepted: 0, rejected: 0, error: msg, checkedAt: now.toISOString() });
      }
    }),
  );

  const merged = mergeArticles(existing, accepted, tz, now);
  push('info', `Clustered: ${merged.added} new stories, ${merged.updated} sources joined existing stories, ${merged.duplicates} exact duplicates skipped.`);

  let liveOpps: GlobalOpportunity[] | undefined;
  if (!disabled.includes('devpost')) {
    try {
      const r = await DEVPOST_ADAPTER.fetch(now);
      liveOpps = r.items;
      push('info', `✓ Devpost: ${r.items.length} open hackathons via ${r.route}`);
      health.push({ adapter: 'devpost', label: DEVPOST_ADAPTER.label, status: 'HEALTHY', fetched: r.items.length, accepted: r.items.length, rejected: 0, route: r.route, checkedAt: now.toISOString() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push('error', `✗ Devpost: ${msg}`);
      health.push({ adapter: 'devpost', label: DEVPOST_ADAPTER.label, status: 'DEGRADED', fetched: 0, accepted: 0, rejected: 0, error: msg, checkedAt: now.toISOString() });
    }
  }

  health.sort((a, b) => a.label.localeCompare(b.label));
  return { stories: merged.stories, health, rejected, log, added: merged.added, updated: merged.updated, liveOpps };
}
