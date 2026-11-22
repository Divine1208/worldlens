import { vi } from 'vitest';

export const NOW = new Date('2026-11-23T05:30:00Z'); // 11:00 IST

const iso = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60000);
const rfc = (d: Date) => d.toUTCString();

export const RBI_RSS = `<?xml version="1.0"?><rss><channel><title>RBI</title>
<item><title>RBI keeps repo rate unchanged; MPC votes to hold</title><link>https://www.rbi.org.in/pr/1</link><pubDate>${rfc(iso(50))}</pubDate><description>The Monetary Policy Committee kept the repo rate unchanged and said CPI inflation is easing.</description></item>
<item><title>Future-dated test release</title><link>https://www.rbi.org.in/pr/future</link><pubDate>${rfc(new Date(NOW.getTime() + 86400000))}</pubDate></item>
<item><title>Release with no date</title><link>https://www.rbi.org.in/pr/nodate</link></item>
</channel></rss>`;

export const GN_RSS = `<?xml version="1.0"?><rss><channel><title>Google News</title>
<item><title>RBI keeps repo rate unchanged as MPC votes to hold - Mint</title><link>https://news.google.com/a1</link><pubDate>${rfc(iso(35))}</pubDate><source url="https://livemint.com">Mint</source></item>
<item><title>Sensex climbs 600 points as FPI buying returns - Business Standard</title><link>https://news.google.com/a2</link><pubDate>${rfc(iso(200))}</pubDate><source url="https://business-standard.com">Business Standard</source></item>
<item><title>Yesterday's GST council meeting outcome explained - The Hindu</title><link>https://news.google.com/a3</link><pubDate>${rfc(new Date(NOW.getTime() - 20 * 3600000))}</pubDate><source url="https://thehindu.com">The Hindu</source></item>
</channel></rss>`;

export const DEEP_DIVE = {
  tldr: 'The RBI kept the repo rate the same. Think of it as the bank-for-banks not changing its lending price.',
  whatHappened: 'The Monetary Policy Committee voted to hold the repo rate.',
  keyDetails: ['Decision announced in an RBI press release.'],
  evidence: [{ point: 'Repo rate unchanged', label: 'FACT', source: 'S1' }],
  conflicts: null,
  background: 'CPI inflation has been easing per the RBI statement.',
  whoIsInvolved: ['RBI', 'MPC'],
  timeline: [{ date: '2026-11-23', event: 'RBI press release', source: 'S1' }],
  whyItMatters: 'Loan EMIs stay where they are for now.',
  impactIndia: 'Borrowers see no immediate change.',
  economicImpact: 'Markets read it as steady policy.',
  entrepreneurLens: { problem: 'Credit stays pricey for small firms', behaviourShift: 'n/a', benefiting: 'Lenders', disrupted: 'None stated', marketGap: 'Inference: cheaper working-capital tools for SMBs.' },
  unclear: ['Timing of next cut is not stated.'],
  watchNext: ['Next MPC meeting'],
  eventDate: null,
  keyTerms: ['Repo Rate', 'CPI'],
};

export function installFetchMock(opts: { failGdelt?: boolean } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input);
    calls.push(url);
    if (url.startsWith('/api/proxy?url=')) url = decodeURIComponent(url.slice('/api/proxy?url='.length));
    const ok = (body: string, type = 'text/xml') => new Response(body, { status: 200, headers: { 'content-type': type } });
    if (url.includes('generativelanguage.googleapis.com')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const prompt: string = body.contents?.[0]?.parts?.[0]?.text ?? '';
      const text = prompt.includes('Write the full deep dive') ? JSON.stringify(DEEP_DIVE) : 'Borrowers and banks benefit most from stability [S1].';
      return ok(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), 'application/json');
    }
    if (url.includes('api.gdeltproject.org')) {
      if (opts.failGdelt) return new Response('down', { status: 503 });
      return ok(JSON.stringify({ articles: [{ url: 'https://example.in/ai', title: 'Indian startup launches open-weight Hindi LLM', seendate: iso(100).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), domain: 'example.in' }] }), 'application/json');
    }
    if (url.includes('rbi.org.in')) return ok(RBI_RSS);
    if (url.includes('news.google.com/rss')) return url.includes('Sensex') ? ok(GN_RSS) : ok('<rss><channel><title>x</title></channel></rss>');
    if (url.includes('hn.algolia.com')) return ok(JSON.stringify({ hits: [] }), 'application/json');
    if (url.includes('devpost.com')) return ok(JSON.stringify({ hackathons: [] }), 'application/json');
    // everything else (PIB, SEBI, The Hindu) is "down" to exercise degraded handling
    return new Response('blocked', { status: 403 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}
