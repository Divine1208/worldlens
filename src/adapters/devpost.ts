import type { GlobalOpportunity } from '../types';
import { stripHtml } from './rss';

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parse Devpost's human date range ("Nov 01 - Dec 15, 2026", "Dec 01 - 15, 2026", "Nov 20, 2026 - Jan 10, 2027"). */
export function parseDevpostRange(s: string): { start: string | null; end: string | null } {
  if (!s) return { start: null, end: null };
  const [a, b] = s.split(/\s+-\s+/);
  if (!b) return { start: null, end: null };
  const endM = b.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  const endDayOnly = b.match(/^(\d{1,2}),\s*(\d{4})$/);
  const startM = a.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!startM) return { start: null, end: null };
  let ey: number, em: number, ed: number;
  if (endM) {
    em = MONTHS[endM[1].toLowerCase()];
    ed = +endM[2];
    ey = +endM[3];
  } else if (endDayOnly) {
    em = MONTHS[startM[1].toLowerCase()];
    ed = +endDayOnly[1];
    ey = +endDayOnly[2];
  } else return { start: null, end: null };
  const sm = MONTHS[startM[1].toLowerCase()];
  const sy = startM[3] ? +startM[3] : sm > em ? ey - 1 : ey;
  const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start: iso(sy, sm, +startM[2]), end: iso(ey, em, ed) };
}

interface DevpostHackathon {
  id: number;
  title: string;
  url: string;
  submission_period_dates?: string;
  time_left_to_submission?: string;
  prize_amount?: string;
  themes?: { name: string }[];
  organization_name?: string;
  open_state?: string;
  invite_only?: boolean;
  displayed_location?: { location?: string };
}

export function parseDevpost(data: unknown, now: Date): GlobalOpportunity[] {
  const list = ((data as { hackathons?: DevpostHackathon[] })?.hackathons ?? []).filter((h) => h.open_state !== 'ended' && !h.invite_only);
  return list.map((h) => {
    const { start, end } = parseDevpostRange(h.submission_period_dates ?? '');
    const prizeText = stripHtml(h.prize_amount ?? '');
    const usd = Number((prizeText.match(/\$\s?([\d,]+)/)?.[1] ?? '').replace(/,/g, '')) || undefined;
    const online = /online/i.test(h.displayed_location?.location ?? '');
    return {
      id: `devpost-${h.id}`,
      name: h.title,
      organization: h.organization_name || 'Devpost host',
      country: online ? 'Global (online)' : h.displayed_location?.location ?? 'See page',
      category: 'digital-bounties',
      vibe: `Build and submit a project during the hackathon. Themes: ${(h.themes ?? []).map((t) => t.name).join(', ') || 'see page'}.`,
      whoCanParticipate: 'See the hackathon’s Rules tab — eligibility (age, country) differs per hackathon.',
      individualsCanApply: 'Unclear',
      studentsCanApply: 'Unclear',
      indiansEligible: 'Unclear',
      indiansEligibleNote: 'Devpost hackathons set their own country rules — check the Rules tab before building.',
      minAge: null,
      stage: 'Idea',
      openingDate: start ? `${start}T00:00:00Z` : null,
      deadlineISO: end ? `${end}T23:59:00Z` : null,
      deadlineNote: `Devpost lists: “${h.submission_period_dates ?? 'n/a'}” (${h.time_left_to_submission ?? ''}). Exact cut-off time/timezone is on the hackathon page.`,
      bag: prizeText ? `${prizeText} in prizes (as listed on Devpost)` : 'Prize not listed',
      fundingType: 'Prize',
      winnersReceive: 'See the hackathon’s Prizes tab.',
      submission: [
        { id: 'register', label: 'Register on Devpost' },
        { id: 'repo', label: 'Project repo / demo link' },
        { id: 'video', label: 'Demo video (most hackathons ask for one)' },
      ],
      officialUrl: h.url,
      evidence: [{ label: 'Devpost hackathon page', url: h.url }],
      lastChecked: now.toISOString().slice(0, 10),
      whyWorthIt: 'Live open hackathon — fast, online-friendly way to win prizes and build a portfolio.',
      sector: (h.themes ?? []).map((t) => t.name.toLowerCase()).concat(['software']),
      team: 'Either',
      mode: online ? 'Online' : 'Offline',
      huntingGround: 'Devpost',
      announced: true,
      verified: true,
      verificationNote: 'Pulled live from the hosting platform (Devpost).',
      takesEquity: false,
      origin: 'LIVE_WEB',
      prizeUSD: usd,
    } satisfies GlobalOpportunity;
  });
}
