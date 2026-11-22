import type { RawArticle } from '../types';

export interface FeedMeta {
  adapter: string;
  publisher?: string; // fixed publisher; else from <source> or feed title
  sourceType: RawArticle['sourceType'];
  credibilityTier: RawArticle['credibilityTier'];
  categoryHint?: RawArticle['categoryHint'];
}

function txt(el: Element | null | undefined): string {
  return (el?.textContent ?? '').trim();
}

function first(item: Element, names: string[]): Element | null {
  for (const n of names) {
    const found = item.getElementsByTagName(n)[0];
    if (found) return found;
  }
  return null;
}

export function stripHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse RSS 2.0 or Atom into RawArticles. Timestamps are passed through untouched for validation. */
export function parseFeed(xml: string, meta: FeedMeta): RawArticle[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('feed is not valid XML');
  const feedTitle = txt(doc.querySelector('channel > title')) || txt(doc.querySelector('feed > title'));
  const items = Array.from(doc.getElementsByTagName('item')).concat(Array.from(doc.getElementsByTagName('entry')));
  return items
    .map((it): RawArticle | null => {
      const title = stripHtml(txt(first(it, ['title'])));
      const linkEl = first(it, ['link']);
      const link = linkEl?.getAttribute('href') || txt(linkEl) || txt(first(it, ['guid']));
      if (!title || !link) return null;
      const sourceEl = first(it, ['source']);
      const publisher = meta.publisher || txt(sourceEl) || feedTitle || meta.adapter;
      return {
        title,
        url: link,
        publisher,
        publishedAtRaw: txt(first(it, ['pubDate', 'published', 'dc:date', 'date', 'updated'])) || null,
        updatedAtRaw: txt(first(it, ['updated', 'atom:updated'])) || null,
        summary: stripHtml(txt(first(it, ['description', 'summary', 'content']))).slice(0, 500),
        author: txt(first(it, ['author', 'dc:creator'])) || undefined,
        sourceType: meta.sourceType,
        credibilityTier: meta.credibilityTier,
        adapter: meta.adapter,
        categoryHint: meta.categoryHint,
        timestampKind: 'published',
      };
    })
    .filter((x): x is RawArticle => !!x);
}
