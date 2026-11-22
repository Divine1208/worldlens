/** Timezone-aware helpers. Everything is computed with Intl — no hardcoded dates, no fixed offsets. */

function parts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return {
    year: +o.year,
    month: +o.month,
    day: +o.day,
    hour: +o.hour,
    minute: +o.minute,
    second: +o.second,
  };
}

/** YYYY-MM-DD for the given instant in the given timezone. */
export function dateKey(d: Date | string | number, tz: string): string {
  const p = parts(new Date(d), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 0..23 hour for the instant in timezone. */
export function hourOf(d: Date | string | number, tz: string): number {
  return parts(new Date(d), tz).hour;
}

/** Offset of tz from UTC at instant, in minutes (e.g. +330 for IST). */
export function tzOffsetMin(d: Date, tz: string): number {
  const p = parts(d, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which the next local midnight occurs in tz. */
export function nextMidnight(now: Date, tz: string): Date {
  const p = parts(now, tz);
  // local midnight of the next day, expressed as if UTC, then corrected by offset
  const guess = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0);
  const off = tzOffsetMin(new Date(guess), tz);
  return new Date(guess - off * 60000);
}

export function msUntilMidnight(now: Date, tz: string): number {
  return nextMidnight(now, tz).getTime() - now.getTime();
}

export function formatDateTime(d: Date | string | number | undefined | null, tz: string): string {
  if (d === undefined || d === null || d === '') return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatDateOnly(d: string | Date, tz: string): string {
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d);
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function hourLabel(h: number): string {
  const fmt = (x: number) => {
    const ampm = x < 12 ? 'AM' : 'PM';
    const hh = x % 12 === 0 ? 12 : x % 12;
    return `${String(hh).padStart(2, '0')}:`;
  };
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${fmt(h)}00–${fmt(h)}59 ${ampm}`;
}

export function tzShort(tz: string): string {
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IST';
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((x) => x.type === 'timeZoneName');
    return p?.value ?? tz;
  } catch {
    return tz;
  }
}

export function relativeAgo(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
