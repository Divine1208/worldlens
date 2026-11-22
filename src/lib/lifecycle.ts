import type { NewsStory } from '../types';
import { dateKey, hourOf } from './time';

export interface HourBucket {
  hour: number;
  stories: NewsStory[];
}

/** Today's cycle date in the user's timezone — always computed, never hardcoded. */
export function currentCycle(now: Date, tz: string): string {
  return dateKey(now, tz);
}

/**
 * Split the store into the current-day view and the archive.
 * Nothing is deleted: archive = every story whose cycle date is before today.
 * Each story's date key is recomputed with the current tz so a timezone change re-buckets correctly.
 */
export function splitByCycle(stories: NewsStory[], now: Date, tz: string) {
  const today = currentCycle(now, tz);
  const todayStories: NewsStory[] = [];
  const archive: NewsStory[] = [];
  for (const s of stories) {
    const key = dateKey(s.publishedAt, tz);
    const st = key === s.dateKeyIST ? s : { ...s, dateKeyIST: key, hourIST: hourOf(s.publishedAt, tz) };
    if (key === today) todayStories.push(st);
    else if (key < today) archive.push({ ...st, origin: 'ARCHIVE_RECORD' });
    // key > today cannot happen: validator rejects future items.
  }
  return { today, todayStories, archive };
}

/** Reverse-chronological hourly windows from the current hour down to 00:00. Empty hours are kept (quiet-hour honesty). */
export function bucketByHour(todayStories: NewsStory[], now: Date, tz: string): HourBucket[] {
  const currentHour = hourOf(now, tz);
  const buckets: HourBucket[] = [];
  for (let h = currentHour; h >= 0; h--) {
    buckets.push({
      hour: h,
      stories: todayStories
        .filter((s) => s.hourIST === h)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    });
  }
  return buckets;
}

export function archiveDates(archive: NewsStory[]): string[] {
  return Array.from(new Set(archive.map((s) => s.dateKeyIST))).sort().reverse();
}

/** Has the cycle rolled over since `lastCycle`? */
export function didRollover(lastCycle: string, now: Date, tz: string): boolean {
  return currentCycle(now, tz) !== lastCycle;
}

export function rankFlat(stories: NewsStory[]): NewsStory[] {
  return [...stories].sort((a, b) => {
    const ra = a.importance * 0.6 + recency(a) * 0.4;
    const rb = b.importance * 0.6 + recency(b) * 0.4;
    return rb - ra;
  });
}
function recency(s: NewsStory) {
  const h = (Date.now() - new Date(s.updatedAt).getTime()) / 3600000;
  return Math.max(0, 100 - h * 4);
}
