import type { Category, Source } from '../types';

const RULES: { cat: Category; words: RegExp }[] = [
  {
    cat: 'markets',
    words:
      /\b(sensex|nifty|stock|stocks|shares|equit(y|ies)|bond|yield|rupee|forex|fpi|dii|ipo|earnings|q[1-4] results|profit|crude|brent|gold price|commodit|market cap|bse|nse|dow|nasdaq|s&p|fed rate|treasur)/i,
  },
  {
    cat: 'ai-tech',
    words:
      /\b(ai|a\.i\.|artificial intelligence|genai|llm|gpt|gemini|claude|openai|anthropic|nvidia|chip|semiconductor|gpu|robot|cyber|software|cloud|data cent|quantum|meity|deepfake|model|algorithm|open-source|hugging ?face|arxiv)\b/i,
  },
  {
    cat: 'startups',
    words:
      /\b(startup|start-up|founder|funding round|raises|seed round|series [a-e]|unicorn|venture|vc fund|accelerator|incubat|d2c|saas|fintech|edtech|healthtech|agritech|acqui(re|sition)|dpiit)\b/i,
  },
  {
    cat: 'india',
    words:
      /\b(india|indian|rbi|sebi|lok sabha|rajya sabha|parliament|modi|union budget|gst|pib|ministry|supreme court|high court|delhi|mumbai|bengaluru|chennai|kolkata|hyderabad|state government|niti aayog|isro|upi|pli|cpi|repo)\b/i,
  },
];

export function classifyCategory(text: string): Category {
  for (const r of RULES) if (r.words.test(text)) return r.cat;
  return 'world';
}

const HIGH_SIGNAL =
  /\b(rbi|repo|budget|gdp|inflation|cpi|tariff|sanction|war|ceasefire|election result|supreme court|policy|bill passed|act|ban|sebi|fed|interest rate|recession|crash|surge|record|acquisition|layoff|ipo)\b/i;

/**
 * Transparent heuristic importance (0–100). Inputs: source count, source credibility,
 * high-signal keywords and recency. Documented so the user can see why a number is what it is.
 */
export function scoreImportance(sources: Source[], _cat: Category, now: Date): number {
  const publishers = new Set(sources.map((s) => s.publisher.toLowerCase())).size;
  const bestTier = Math.min(...sources.map((s) => s.credibilityTier));
  const text = sources.map((s) => s.title).join(' ');
  let score = 25;
  score += Math.min(publishers, 8) * 6; // up to +48
  score += bestTier <= 1 ? 15 : bestTier <= 2 ? 10 : bestTier <= 4 ? 5 : 0;
  if (HIGH_SIGNAL.test(text)) score += 10;
  const latest = Math.max(...sources.map((s) => new Date(s.publicationDate).getTime()));
  const ageH = (now.getTime() - latest) / 3600000;
  if (ageH > 12) score -= 5;
  return Math.max(1, Math.min(100, Math.round(score)));
}
