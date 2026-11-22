import type { GlobalOpportunity, OppCategory, OppStatus, Stage } from '../types';
import { dateKey } from './time';
import { DEFAULTS } from '../config';

export const OPP_CATEGORY_LABEL: Record<OppCategory, string> = {
  grants: 'Funding & Free Money (Grants)',
  competitions: 'Competitions & Battles',
  'creative': 'Creative & Entertainment',
  fellowships: 'Fellowships (“Drop Out & Build”)',
  accelerators: 'Accelerators & Incubators (“Level Up”)',
  science: 'Science & Invention',
  'intl-mega': 'International Orgs & Mega Challenges',
  corporate: 'Business & Corporate',
  'digital-bounties': 'Digital & Emerging Tech Bounties',
  awards: 'Awards & Recognition',
};

/**
 * Whole days left until the deadline, counted in the user's timezone.
 * Deadline is stored as an absolute instant (ISO with offset); we compare calendar days in tz.
 */
export function daysRemaining(deadlineISO: string | null, now: Date, tz: string): number | null {
  if (!deadlineISO) return null;
  const d = new Date(deadlineISO);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime()) return -1;
  const a = new Date(dateKey(now, tz) + 'T00:00:00Z').getTime();
  const b = new Date(dateKey(d, tz) + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

export function computeStatus(o: GlobalOpportunity, now: Date): OppStatus {
  if (o.deadlineISO && new Date(o.deadlineISO).getTime() < now.getTime()) return 'CLOSED';
  if (o.openingDate && new Date(o.openingDate).getTime() > now.getTime()) return 'PREPARE_NOW';
  if (o.rolling) return 'APPLY_NOW';
  if (!o.announced) return 'WATCH';
  return 'APPLY_NOW';
}

/** Active list = everything except CLOSED. CLOSED is strictly excluded. */
export function activeOpportunities(list: GlobalOpportunity[], now: Date): GlobalOpportunity[] {
  return list.filter((o) => computeStatus(o, now) !== 'CLOSED');
}

const STAGE_ORDER: Stage[] = ['Idea', 'Prototype', 'MVP', 'Revenue', 'Established'];
export const stageIndex = (s: Stage) => STAGE_ORDER.indexOf(s);

/**
 * Discovery score 0–100. Not just prize size:
 * non-dilutive, idea-stage access, India eligibility, individual access, low friction, urgency and upside.
 */
export function discoveryScore(o: GlobalOpportunity, now: Date, tz: string): number {
  let s = 20;
  if (!o.takesEquity) s += 18;
  s += [14, 9, 5, 2, 0][stageIndex(o.stage)] ?? 0;
  if (o.indiansEligible === 'Yes') s += 12;
  else if (o.indiansEligible === 'Unclear') s += 4;
  if (o.individualsCanApply === 'Yes') s += 8;
  if (o.studentsCanApply === 'Yes') s += 4;
  if (o.mode !== 'Offline') s += 3;
  if (o.submission.length <= 3) s += 4; // low friction
  const st = computeStatus(o, now);
  if (st === 'APPLY_NOW') s += 8;
  if (st === 'PREPARE_NOW') s += 4;
  const d = daysRemaining(o.deadlineISO, now, tz);
  if (d !== null && d >= 0 && d <= DEFAULTS.urgentDays) s += 3;
  if (o.prizeUSD) s += Math.min(8, Math.log10(o.prizeUSD) * 1.6);
  if (!o.verified) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export interface OppFilters {
  q: string;
  country: string;
  category: string;
  sector: string;
  minPrize: number;
  nonDilutiveOnly: boolean;
  eligibility: '' | 'student' | 'individual' | 'india';
  maxMinAge: number | null; // show opps open to someone of this age
  stage: '' | Stage;
  deadlineWithin: number | null; // days
  team: '' | 'Individual' | 'Team';
  mode: '' | 'Online' | 'Offline';
}

export const EMPTY_FILTERS: OppFilters = {
  q: '',
  country: '',
  category: '',
  sector: '',
  minPrize: 0,
  nonDilutiveOnly: false,
  eligibility: '',
  maxMinAge: null,
  stage: '',
  deadlineWithin: null,
  team: '',
  mode: '',
};

export function filterOpportunities(list: GlobalOpportunity[], f: OppFilters, now: Date, tz: string) {
  const q = f.q.trim().toLowerCase();
  return activeOpportunities(list, now)
    .filter((o) => {
      if (q) {
        const hay = [o.name, o.organization, o.vibe, o.country, o.sector.join(' '), o.category, o.whyWorthIt]
          .join(' ')
          .toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      if (f.country && !o.country.toLowerCase().includes(f.country.toLowerCase())) return false;
      if (f.category && o.category !== f.category) return false;
      if (f.sector && !o.sector.some((s) => s.toLowerCase().includes(f.sector.toLowerCase()))) return false;
      if (f.minPrize && (o.prizeUSD ?? 0) < f.minPrize) return false;
      if (f.nonDilutiveOnly && o.takesEquity) return false;
      if (f.eligibility === 'student' && o.studentsCanApply !== 'Yes') return false;
      if (f.eligibility === 'individual' && o.individualsCanApply !== 'Yes') return false;
      if (f.eligibility === 'india' && o.indiansEligible !== 'Yes') return false;
      if (f.maxMinAge !== null && o.minAge !== null && o.minAge > f.maxMinAge) return false;
      if (f.stage && stageIndex(o.stage) > stageIndex(f.stage)) return false;
      if (f.deadlineWithin !== null) {
        const d = daysRemaining(o.deadlineISO, now, tz);
        if (d === null || d > f.deadlineWithin) return false;
      }
      if (f.team === 'Individual' && o.team === 'Team') return false;
      if (f.team === 'Team' && o.team === 'Individual') return false;
      if (f.mode && o.mode !== f.mode && o.mode !== 'Hybrid') return false;
      return true;
    })
    .sort((a, b) => discoveryScore(b, now, tz) - discoveryScore(a, now, tz));
}

/** Idea → opportunity matcher: keyword overlap + accessibility weighting. Pure, offline. */
export function matchIdea(idea: string, list: GlobalOpportunity[], now: Date, tz: string) {
  const words = idea
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  const synonyms: Record<string, string[]> = {
    film: ['creative', 'film', 'video', 'ai film'],
    video: ['creative', 'film'],
    game: ['game', 'unreal', 'creative', '3d'],
    health: ['health', 'biotech', 'medical'],
    bio: ['biotech', 'health'],
    climate: ['climate', 'energy'],
    poverty: ['poverty', 'social'],
    farm: ['agri', 'poverty'],
    hardware: ['hardware', 'prototype', 'science'],
    ai: ['ai', 'software', 'tech'],
    app: ['software', 'tech'],
    school: ['education', 'learning'],
    education: ['education', 'learning'],
  };
  const expanded = new Set(words.flatMap((w) => [w, ...(synonyms[w] ?? [])]));
  return activeOpportunities(list, now)
    .map((o) => {
      const hay = [o.name, o.vibe, o.sector.join(' '), o.category, o.whyWorthIt].join(' ').toLowerCase();
      let hits = 0;
      expanded.forEach((w) => {
        if (hay.includes(w)) hits++;
      });
      const access = (o.stage === 'Idea' ? 10 : 0) + (o.takesEquity ? 0 : 8) + (o.individualsCanApply === 'Yes' ? 6 : 0);
      return { o, score: hits * 12 + access + discoveryScore(o, now, tz) * 0.3, hits };
    })
    .filter((x) => x.hits > 0 || x.o.sector.includes('Any'))
    .sort((a, b) => b.score - a.score);
}
