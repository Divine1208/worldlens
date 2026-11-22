export type Category = 'india' | 'world' | 'markets' | 'ai-tech' | 'startups';
export type DataOrigin = 'LIVE_WEB' | 'ARCHIVE_RECORD' | 'DEMO_DATA';
export type ChangeTag = 'NEW' | 'UPDATED' | 'DEVELOPING' | 'ONGOING';
export type Confidence = 'VERIFIED' | 'DEVELOPING' | 'CLAIM' | 'ANALYSIS' | 'UNCONFIRMED';
export type SourceType =
  | 'official'
  | 'company'
  | 'intl-org'
  | 'news'
  | 'research'
  | 'community'
  | 'aggregator';

/** One article from one publisher, as fetched by an adapter. */
export interface RawArticle {
  title: string;
  url: string;
  publisher: string;
  /** Exactly what the source said; may be missing or malformed. */
  publishedAtRaw?: string | number | null;
  updatedAtRaw?: string | number | null;
  summary?: string;
  author?: string;
  sourceType: SourceType;
  credibilityTier: 1 | 2 | 3 | 4 | 5 | 6;
  adapter: string;
  categoryHint?: Category;
  /** e.g. GDELT gives first-seen time, not publisher time. */
  timestampKind?: 'published' | 'first-seen';
}

export interface Source {
  id: string;
  name: string;
  url: string;
  publisher: string;
  sourceType: SourceType;
  credibilityTier: number;
  publicationDate: string; // ISO
  retrievedAt: string; // ISO
  author?: string;
  claimSupported?: string;
  adapter: string;
  title: string;
  summary?: string;
  timestampKind: 'published' | 'first-seen';
}

export interface NewsStory {
  id: string;
  title: string;
  summary: string;
  category: Category;
  subcategory?: string;
  publishedAt: string; // earliest source publication (ISO)
  updatedAt: string; // latest source publication/verification (ISO)
  collectedAt: string; // first time the app collected it (ISO)
  eventDate?: string; // if extracted & different
  dateKeyIST: string; // YYYY-MM-DD in user's timezone
  hourIST: number; // 0..23
  importance: number; // 0..100
  status: ChangeTag;
  confidence: Confidence;
  origin: DataOrigin;
  sources: Source[];
  concepts: string[];
  entities: string[];
  tokens: string[]; // for clustering
}

export interface RejectedItem {
  title: string;
  adapter: string;
  reason: string;
  raw?: string;
  at: string;
}

export interface AdapterHealth {
  adapter: string;
  label: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DISABLED' | 'NEEDS_KEY' | 'IDLE';
  fetched: number;
  accepted: number;
  rejected: number;
  route?: string;
  error?: string;
  checkedAt?: string;
}

export interface IngestionLogLine {
  at: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

/* ---------------- Opportunities ---------------- */
export type OppCategory =
  | 'grants'
  | 'competitions'
  | 'creative'
  | 'fellowships'
  | 'accelerators'
  | 'science'
  | 'intl-mega'
  | 'corporate'
  | 'digital-bounties'
  | 'awards';

export type FundingType = 'Grant' | 'Prize' | 'Equity' | 'Debt' | 'Credit' | 'Fellowship' | 'Convertible Grant' | 'Mixed';
export type OppStatus = 'APPLY_NOW' | 'PREPARE_NOW' | 'WATCH' | 'CLOSED';
export type Stage = 'Idea' | 'Prototype' | 'MVP' | 'Revenue' | 'Established';
export type YesNo = 'Yes' | 'No' | 'Unclear';
export type PipelineStage =
  | 'Not Started'
  | 'Researching'
  | 'Drafting Application'
  | 'Submitted'
  | 'Interview / Finals'
  | 'Won / Funded';

export interface ChecklistItem {
  id: string;
  label: string;
}

/** The mandatory 21-point record. Field numbers match the spec. */
export interface GlobalOpportunity {
  id: string;
  name: string; // 1
  organization: string; // 2
  country: string; // 3
  category: OppCategory; // 4
  vibe: string; // 5 what you actually need to do
  whoCanParticipate: string; // 6
  individualsCanApply: YesNo; // 7
  studentsCanApply: YesNo; // 8
  indiansEligible: YesNo; // 9
  indiansEligibleNote: string; // 9 details
  minAge: number | null; // 10
  stage: Stage; // 11
  openingDate: string | null; // 12 ISO date or null
  deadlineISO: string | null; // 13 null => not published
  deadlineNote?: string; // 13 e.g. timezone / rolling
  rolling?: boolean;
  bag: string; // 14 amount text, exact as published
  fundingType: FundingType; // 15
  winnersReceive: string; // 16
  submission: ChecklistItem[]; // 17
  officialUrl: string; // 18
  evidence: { label: string; url: string }[]; // 19
  lastChecked: string; // 20 ISO date
  whyWorthIt: string; // 21
  /** extra */
  sector: string[];
  team: 'Individual' | 'Team' | 'Either';
  mode: 'Online' | 'Offline' | 'Hybrid';
  huntingGround: string;
  announced: boolean; // officially announced current/next cycle
  verified: boolean; // checked against official org page
  verificationNote?: string;
  takesEquity: boolean;
  origin: 'CURATED' | 'LIVE_WEB';
  prizeUSD?: number; // only when the published prize is unambiguous
}

export interface MarketOpportunity {
  id: string;
  title: string;
  validation: 'PROVEN BUSINESS MODEL' | 'EMERGING MODEL' | 'HYPOTHETICAL IDEA';
  sector: string;
  whereWorking: string;
  problem: string;
  customer: string;
  businessModel: string;
  whyItWorks: string;
  whyNotMainstream: string;
  capital: 'Very Low' | 'Low' | 'Moderate' | 'High';
  skills: string[];
  indiaPotential: string;
  competition: string;
  risks: string;
  evidence: { kind: 'Evidence' | 'Inference' | 'Speculation'; text: string; url?: string }[];
  origin: 'CURATED' | 'AI_FROM_LIVE_NEWS';
}

export interface Concept {
  term: string;
  simple: string;
  analogy: string;
  advanced: string;
  whyItMatters: string;
  related: string[];
  aliases?: string[];
}

/* ---------------- User state ---------------- */
export interface TrackerEntry {
  stage: PipelineStage;
  checked: Record<string, boolean>;
  draftUrl: string;
  notes: string;
  updatedAt: string;
}

export interface UserState {
  theme: 'dark' | 'light';
  tone: 'genz' | 'analyst';
  timezone: string;
  fontSize: 'S' | 'M' | 'L';
  autoMarkRead: boolean;
  readMap: Record<string, string>; // storyId -> readAt ISO
  savedStories: string[];
  savedOpps: string[];
  tracker: Record<string, TrackerEntry>;
  learnedConcepts: Record<string, string>; // term -> learnedAt
  framings: Record<string, { preset: string; text: string; at: string }>;
  questions: { at: string; storyId?: string; q: string; a: string; provider: string }[];
  followedTopics: string[];
  disabledAdapters: string[];
  notificationPrefs: { deadlines: boolean; newGrants: boolean; breaking: boolean };
}

export interface Vault {
  gemini?: string;
  groq?: string;
  openrouter?: string;
  tavily?: string;
  serper?: string;
  newsdata?: string;
  guardian?: string;
  routerOrder: ('gemini' | 'groq' | 'openrouter')[];
  ensemble: boolean;
  pollIntervalMin: number;
  uiRefreshSec: number;
  useServer: boolean; // Option B: route through /api when deployed
}
