/**
 * Dayjs helpers and shared date utilities.
 */
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(utc);

export { dayjs };

export function formatElapsed(ms: number): string {
  const d = dayjs.duration(ms);
  const hours = String(Math.floor(d.asHours())).padStart(2, "0");
  const minutes = String(d.minutes()).padStart(2, "0");
  const seconds = String(d.seconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
