import { CONCEPT_INDEX } from '../data/concepts';

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KEYS = Array.from(CONCEPT_INDEX.keys()).sort((a, b) => b.length - a.length);
const SHORT_UPPER = new Set(['ai', 'ipo', 'cpi', 'wpi', 'gdp', 'gst', 'fpi', 'fdi', 'dii', 'rbi', 'upi', 'llm', 'gpu', 'pli', 'cad', 'mpc', 'arr', 'mrr', 'inr', 'fii', 'tbi', 'nbfc', 'sebi', 'd2c', 'saas', 'dpiit']);

export const CONCEPT_REGEX = new RegExp(
  `\\b(${KEYS.map(esc).join('|')})\\b`,
  'gi',
);

/** Return canonical concept terms present in text. */
export function detectConcepts(text: string): string[] {
  const found = new Set<string>();
  if (!text) return [];
  for (const m of text.matchAll(CONCEPT_REGEX)) {
    const k = m[1].toLowerCase();
    // Short acronyms must appear upper-case in the text to avoid false positives (e.g. "fab" in "fabulous").
    if (SHORT_UPPER.has(k) && m[1] !== m[1].toUpperCase() && k !== 'saas') continue;
    if (['chip', 'fab', 'listing', 'stake', 'yield', 'yields', 'budget'].includes(k) && found.size > 6) continue;
    const c = CONCEPT_INDEX.get(k);
    if (c) found.add(c.term);
  }
  return Array.from(found);
}
