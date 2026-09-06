/**
 * Calendar dates in the active organization's IANA timezone.
 *
 * The backend records a work day using the org timezone (see
 * `calendarDateColumn`) and reads date-only query params as UTC midnight, so
 * "today" must be built in the org zone. Using the device zone silently
 * returns nothing whenever the two disagree — e.g. a UTC org viewed at
 * 01:00 in Asia/Dhaka, where the device is already on the next day.
 */
import { useAuthStore } from "@/store/auth.store";

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveZone(timeZone?: string | null): string {
  const zone = timeZone?.trim();
  if (!zone) return deviceZone();
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return deviceZone();
  }
}

/** IANA timezone of the active org; device zone when unknown. */
export function getOrgTimezone(): string | null {
  const { organizations, organizationId } = useAuthStore.getState();
  return organizations.find((o) => o.id === organizationId)?.timezone ?? null;
}

/** `YYYY-MM-DD` for `date` as seen in `timeZone`. */
export function ymdInZone(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInZone(timeZone?: string | null): string {
  return ymdInZone(new Date(), timeZone);
}

// Calendar arithmetic runs on a UTC-anchored date so the device offset can
// never shift a day boundary.
function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function shiftDays(ymd: string, days: number): string {
  const date = ymdToUtc(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing today in `timeZone`. */
export function weekStartYmd(timeZone?: string | null): string {
  const today = todayInZone(timeZone);
  const weekday = ymdToUtc(today).getUTCDay();
  return shiftDays(today, weekday === 0 ? -6 : 1 - weekday);
}

/** Sunday of the week containing today in `timeZone`. */
export function weekEndYmd(timeZone?: string | null): string {
  return shiftDays(weekStartYmd(timeZone), 6);
}

export function monthStartYmd(timeZone?: string | null): string {
  return `${todayInZone(timeZone).slice(0, 7)}-01`;
}

export function monthEndYmd(timeZone?: string | null): string {
  const start = ymdToUtc(monthStartYmd(timeZone));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

/** e.g. "Sunday" — the weekday it currently is in `timeZone`. */
export function weekdayLabelInZone(timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveZone(timeZone),
    weekday: "long",
  }).format(new Date());
}

/** e.g. "Sep 6" — the date it currently is in `timeZone`. */
export function monthDayLabelInZone(timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveZone(timeZone),
    month: "short",
    day: "numeric",
  }).format(new Date());
}
