/**
 * 17-year-old Gen Z Plain English protocol — banned corporate words get swapped automatically.
 * Applied to generated text and app copy. Publisher headlines and direct quotes are left verbatim
 * (they are receipts — changing them would misquote the source).
 */
type Rep = string | ((m: string, ...g: string[]) => string);
/** Spec-mandated swaps, applied grammar-aware so sentences still read naturally. */
export const BANNED: [RegExp, Rep][] = [
  // adjective use ("a comprehensive plan") → "a whole-picture plan"; standalone → "the whole picture"
  [/\b(an?\s+)?comprehensive(?=\s+[a-z])/gi, (_m, art) => (art ? art.replace(/an\s+/i, (x) => x[0] + ' ') : '') + 'whole-picture'],
  [/\b(the\s+)?comprehensive\b/gi, () => 'the whole picture'],
  [/\bsynerg(y|ies)\b/gi, 'teaming up'],
  [/\bpivot(ing|ed|s)?\b/gi, (_m, suf) => ({ ing: 'switching up', ed: 'switched up', s: 'switches up' } as Record<string, string>)[suf?.toLowerCase()] ?? 'switch up'],
  [/\bfiduciary\b/gi, 'money-rules'],
  [/\b(the\s+)?infrastructure\b/gi, (_m, the) => (the ? 'the setup' : 'setup')],
  [/\b(the\s+)?ecosystems?\b/gi, (_m, the) => (the ? 'the community' : 'community')],
  [/\b(new\s+)?paradigm\b/gi, () => 'new vibe'],
];

function matchCase(src: string, rep: string): string {
  if (src[0] && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase())
    return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

export function sanitizeGenZ(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of BANNED)
    out = out.replace(re, (m: string, ...g: string[]) => matchCase(m, typeof rep === 'string' ? rep : rep(m, ...g)));
  return out;
}

export function containsBanned(text: string): string[] {
  const hits: string[] = [];
  for (const [re] of BANNED) {
    const r = new RegExp(re.source, 'gi');
    const m = text.match(r);
    if (m) hits.push(...m);
  }
  return hits;
}

/** Recursively sanitize every string in an AI JSON response. */
export function sanitizeDeep<T>(v: T): T {
  if (typeof v === 'string') return sanitizeGenZ(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => sanitizeDeep(x)) as unknown as T;
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = sanitizeDeep(x);
    return o as T;
  }
  return v;
}
