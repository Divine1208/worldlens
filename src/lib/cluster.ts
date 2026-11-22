import type { Category, ChangeTag, NewsStory, RawArticle, Source } from '../types';
import { dateKey, hourOf } from './time';
import { classifyCategory, scoreImportance } from './classify';
import { detectConcepts } from './conceptDetect';

const STOP = new Set(
  'a an the and or of to in on for with by at from as is are was were be been it its this that after over into amid says said say new news live update updates report reports latest vs about up down how why what will can could may than more less out off top today week year'.split(
    ' ',
  ),
);

/** Strip " - Publisher" / " | Publisher" suffixes that aggregators append. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s+[-|–—]\s+[^-|–—]{2,60}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(title: string): string[] {
  return Array.from(
    new Set(
      cleanTitle(title)
        .toLowerCase()
        .replace(/[₹$€£%]/g, ' ')
        .replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  );
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const x of a) if (sb.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

/** Small, stable string hash (FNV-1a) used for ids & cache keys. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'ocid'].forEach((k) =>
      url.searchParams.delete(k),
    );
    return url.toString().replace(/\/$/, '');
  } catch {
    return u.trim();
  }
}

export const SIMILARITY_THRESHOLD = 0.5;

export interface AcceptedArticle extends RawArticle {
  publishedAtISO: string;
  updatedAtISO?: string;
}

function toSource(a: AcceptedArticle, retrievedAt: string): Source {
  return {
    id: hash(normalizeUrl(a.url)),
    name: a.publisher,
    publisher: a.publisher,
    url: a.url,
    sourceType: a.sourceType,
    credibilityTier: a.credibilityTier,
    publicationDate: a.publishedAtISO,
    retrievedAt,
    author: a.author,
    adapter: a.adapter,
    title: cleanTitle(a.title),
    summary: a.summary,
    timestampKind: a.timestampKind ?? 'published',
  };
}

/** Recompute derived fields from the source list. */
function refresh(story: NewsStory, tz: string, now: Date): NewsStory {
  const sorted = [...story.sources].sort((x, y) => x.publicationDate.localeCompare(y.publicationDate));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Headline comes from the most credible source (lowest tier number).
  const best = [...story.sources].sort((x, y) => x.credibilityTier - y.credibilityTier)[0];
  const spanH = (new Date(last.publicationDate).getTime() - new Date(first.publicationDate).getTime()) / 3600000;
  const publishers = new Set(story.sources.map((s) => s.publisher.toLowerCase()));
  const official = story.sources.some((s) => s.credibilityTier <= 2);
  return {
    ...story,
    title: best.title,
    summary: story.summary || best.summary || '',
    publishedAt: first.publicationDate,
    updatedAt: last.publicationDate,
    dateKeyIST: dateKey(first.publicationDate, tz),
    hourIST: hourOf(first.publicationDate, tz),
    confidence: official || publishers.size >= 3 ? 'VERIFIED' : publishers.size === 2 ? 'DEVELOPING' : 'UNCONFIRMED',
    importance: scoreImportance(story.sources, story.category, now),
    status: deriveStatus(story, spanH, tz),
  };
}

function deriveStatus(story: NewsStory, spanH: number, tz: string): ChangeTag {
  const days = new Set(story.sources.map((s) => dateKey(s.publicationDate, tz)));
  if (days.size > 1) return 'ONGOING';
  if (story.sources.length >= 3 && spanH >= 2) return 'DEVELOPING';
  if (story.status === 'UPDATED' || story.status === 'DEVELOPING') return story.status;
  return story.sources.length > 1 && story.status !== 'NEW' ? 'UPDATED' : story.status;
}

/**
 * Merge freshly accepted articles into the existing story store.
 * - identical URL => same source (deduplicated, never double-counted)
 * - similar headline (Jaccard >= threshold, same category window) => same story cluster
 * Original publication dates are never overwritten.
 */
export function mergeArticles(
  existing: NewsStory[],
  incoming: AcceptedArticle[],
  tz: string,
  now: Date = new Date(),
): { stories: NewsStory[]; added: number; updated: number; duplicates: number } {
  const stories = existing.map((s) => ({ ...s, sources: [...s.sources] }));
  const byUrl = new Map<string, NewsStory>();
  for (const s of stories) for (const src of s.sources) byUrl.set(normalizeUrl(src.url), s);
  const nowISO = now.toISOString();
  let added = 0,
    updated = 0,
    duplicates = 0;
  const touched = new Set<string>();

  for (const a of incoming) {
    const nurl = normalizeUrl(a.url);
    if (byUrl.has(nurl)) {
      duplicates++;
      continue;
    }
    const tokens = tokenize(a.title);
    const pubMs = new Date(a.publishedAtISO).getTime();
    let match: NewsStory | undefined;
    let bestScore = 0;
    for (const s of stories) {
      // Only cluster within a 72h window of the story to avoid merging different events.
      if (Math.abs(new Date(s.publishedAt).getTime() - pubMs) > 72 * 3600000) continue;
      const score = jaccard(tokens, s.tokens);
      if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
        bestScore = score;
        match = s;
      }
    }
    const src = toSource(a, nowISO);
    if (match) {
      match.sources.push(src);
      match.tokens = Array.from(new Set([...match.tokens, ...tokens]));
      if (!touched.has(match.id) && match.status === 'NEW' && match.collectedAt !== nowISO) match.status = 'UPDATED';
      touched.add(match.id);
      byUrl.set(nurl, match);
      updated++;
    } else {
      const category: Category = a.categoryHint ?? classifyCategory(a.title + ' ' + (a.summary ?? ''));
      const s: NewsStory = {
        id: hash(nurl + a.publishedAtISO),
        title: cleanTitle(a.title),
        summary: a.summary ?? '',
        category,
        publishedAt: a.publishedAtISO,
        updatedAt: a.publishedAtISO,
        collectedAt: nowISO,
        dateKeyIST: dateKey(a.publishedAtISO, tz),
        hourIST: hourOf(a.publishedAtISO, tz),
        importance: 0,
        status: 'NEW',
        confidence: 'UNCONFIRMED',
        origin: 'LIVE_WEB',
        sources: [src],
        concepts: detectConcepts(a.title + ' ' + (a.summary ?? '')),
        entities: [],
        tokens,
      };
      stories.push(s);
      byUrl.set(nurl, s);
      touched.add(s.id);
      added++;
    }
  }
  const out = stories.map((s) => (touched.has(s.id) ? refresh(s, tz, now) : s));
  return { stories: out, added, updated, duplicates };
}
