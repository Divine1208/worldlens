/**
 * Central brand + runtime configuration.
 * Rebrand the whole app by editing BRAND below — nothing else hardcodes the name.
 */
export const BRAND = {
  name: 'WorldLens',
  tagline: 'Personal Intelligence Desk',
  shortName: 'WorldLens',
  themeColor: '#020617',
};

export const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  /** Background poll interval in minutes (15 / 30 / 60). */
  pollIntervalMin: 30,
  /** UI refresh interval in seconds (re-render clocks, countdowns, rollover check). */
  uiRefreshSec: 30,
  /** Reject items published more than this far in the future. */
  futureToleranceMs: 10 * 60 * 1000,
  /** Items older than this are rejected at ingestion as stale (they never become "today" news). */
  maxAgeDays: 30,
  /** Urgent deadline threshold (days). */
  urgentDays: 15,
  autoMarkReadOnOpen: true,
  /** Public CORS relays used only in zero-install browser mode when a source blocks direct browser fetches. */
  corsRelays: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
  ],
};

export const STORAGE_KEYS = {
  user: 'worldlens.user.v1',
  vault: 'worldlens.vault.v1',
  stories: 'worldlens.stories.v1',
  health: 'worldlens.health.v1',
  aiCache: 'worldlens.aicache.v1',
  liveOpps: 'worldlens.liveopps.v1',
};
