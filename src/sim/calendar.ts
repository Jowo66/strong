// In-game calendar. Day 0 is the real-world date the gym was created.
// One "gym day" covers opening hours (06:00–22:00) and lasts settings.dayLengthMinutes of real time.

export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 22;
const MS_DAY = 86_400_000;

export function todayIso(now = new Date()): string {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dateForDay(createdAt: string, day: number): Date {
  return new Date(parseIso(createdAt) + day * MS_DAY);
}

export function isoForDay(createdAt: string, day: number): string {
  return dateForDay(createdAt, day).toISOString().slice(0, 10);
}

export function yearForDay(createdAt: string, day: number): number {
  return dateForDay(createdAt, day).getUTCFullYear();
}

export function formatDate(createdAt: string, day: number): string {
  return dateForDay(createdAt, day).toLocaleDateString('en-CA', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Clock label for a point in the gym day, e.g. "18:42". */
export function clockLabel(dayTime: number, dayLength: number): string {
  const frac = Math.min(1, Math.max(0, dayTime / dayLength));
  const minutes = OPEN_HOUR * 60 + frac * (CLOSE_HOUR - OPEN_HOUR) * 60;
  const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
