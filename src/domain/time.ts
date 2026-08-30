/** Date helpers. Everything the scheduler does is expressed in whole days. */

export const DAY_MS = 86_400_000;

export function toIso(d: Date | number | string): string {
  return new Date(d).toISOString();
}

/** Local midnight at the start of the given instant's day. */
export function startOfDay(d: Date | string | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date | string | number, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Whole days from `a` to `b`, counted by local calendar day. */
export function daysBetween(a: Date | string | number, b: Date | string | number): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export function isDue(nextReviewAt: string | undefined, now: Date | string | number): boolean {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() <= new Date(now).getTime();
}

/** "3일 남음" · "오늘" · "2일 지남" */
export function relativeDayLabel(target: string | undefined, now: Date | string | number): string {
  if (!target) return '예정 없음';
  const d = daysBetween(now, target);
  if (d === 0) return '오늘';
  if (d === 1) return '내일';
  if (d > 1) return `${d}일 뒤`;
  if (d === -1) return '어제부터';
  return `${-d}일 지남`;
}

export function formatDate(d: string | Date | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`;
}
