import type { Category } from '../types';
import { sanitizeGenZ } from './genz';

type Tone = 'genz' | 'analyst';

const COPY: Record<string, { genz: string; analyst: string }> = {
  bag: { genz: 'The Bag', analyst: 'Funding / Prize Amount' },
  vibe: { genz: 'The Vibe', analyst: 'What Participants Must Do' },
  catch: { genz: 'The Catch', analyst: 'Who Can Participate' },
  clock: { genz: 'Clock’s Ticking', analyst: 'Exact Deadline' },
  cheat: { genz: 'Cheat code to win', analyst: 'Submission Requirements' },
  worth: { genz: 'Why it’s worth your time', analyst: 'Strategic Value' },
  lens: { genz: '💡 Entrepreneur’s Lens', analyst: 'Commercial Implications' },
  quiet: {
    genz: 'No verified stories collected in this hour window. WorldLens never fabricates filler stories.',
    analyst: 'No verified stories were collected in this hour window. No placeholder content is shown.',
  },
  noAI: {
    genz: 'Plug in a free AI key (Gemini / Groq / OpenRouter) in the API Vault to unlock the full plain-English breakdown. Until then you get the raw receipts below — straight from the sources.',
    analyst: 'Configure an AI provider in the API Vault to generate the structured analysis. Primary source material is shown below.',
  },
};

export function t(key: keyof typeof COPY | string, tone: Tone): string {
  const c = COPY[key];
  return c ? (tone === 'genz' ? sanitizeGenZ(c.genz) : c.analyst) : key;
}

export const CATEGORY_META: Record<Category, { label: string; emoji: string }> = {
  india: { label: 'India', emoji: '🇮🇳' },
  world: { label: 'World', emoji: '🌍' },
  markets: { label: 'Markets & Economy', emoji: '📈' },
  'ai-tech': { label: 'AI & Tech', emoji: '🤖' },
  startups: { label: 'Startups', emoji: '🚀' },
};
