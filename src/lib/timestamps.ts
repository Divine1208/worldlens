import { DEFAULTS } from '../config';

export interface TimestampVerdict {
  ok: boolean;
  iso?: string;
  reason?: 'missing' | 'malformed' | 'future' | 'stale' | 'pre-epoch';
  detail?: string;
}

/** GDELT style 20261123T101500Z */
const COMPACT = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/;

/** Parse anything a source might send. Returns null if it cannot be trusted. */
export function parseTimestamp(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    // seconds vs ms
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const m = s.match(COMPACT);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return isNaN(d.getTime()) ? null : d;
  }
  // NewsData style "2026-11-23 06:10:00" (UTC per their docs) — no zone given
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }
  // A bare date with no time cannot be placed in an hour window.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Strict validator applied to EVERY incoming record at ingestion time.
 * Never "fixes" a timestamp by substituting today's date.
 */
export function validateArticleTimestamp(raw: unknown, now: Date = new Date()): TimestampVerdict {
  if (raw === null || raw === undefined || raw === '') return { ok: false, reason: 'missing' };
  const d = parseTimestamp(raw);
  if (!d) return { ok: false, reason: 'malformed', detail: String(raw).slice(0, 60) };
  if (d.getUTCFullYear() < 1995) return { ok: false, reason: 'pre-epoch', detail: d.toISOString() };
  if (d.getTime() > now.getTime() + DEFAULTS.futureToleranceMs)
    return { ok: false, reason: 'future', detail: d.toISOString() };
  if (now.getTime() - d.getTime() > DEFAULTS.maxAgeDays * 86400000)
    return { ok: false, reason: 'stale', detail: d.toISOString() };
  return { ok: true, iso: d.toISOString() };
}
