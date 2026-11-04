/**
 * Day timeline — logged time, apps, and screenshots for the day picked
 * under the timer. Drag to add or change time only when Settings →
 * Edit and delete timeline is on. Click a block, then Remove, to delete it.
 */
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { AppWindow, Camera, Clock3, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { ACTIVITY_FLUSHED_EVENT, SCREENSHOT_CAPTURED_EVENT } from "@/hooks/useTrackingAgent";
import { todayInZone } from "@/lib/org-date";
import { isValidProjectId } from "@/lib/project";
import { TIMER_STOPPED_EVENT, dispatchTimerStopped } from "@/lib/timer-events";
import { activityApi } from "@/services/api/activity.api";
import { screenshotApi, type ApiScreenshot } from "@/services/api/screenshot.api";
import { timesheetApi, type ApiTimeEntry } from "@/services/api/timesheet.api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clusterApps, clusterShots } from "./timeline-clusters";
import { getElectronAPI, isElectron } from "@/services/electron";
import { SavedCopyNote } from "@/components/layout/saved-copy-note";
import { isOfflineRowId, loadOfflineOverlay } from "@/lib/offline-overlay";
import { readCachedView, writeCachedView } from "@/lib/view-cache";
import { useAuthStore } from "@/store/auth.store";
import { CONNECTION_RESTORED_EVENT, useConnectionStore } from "@/store/connection.store";
import { useSelectedDayStore } from "@/store/selected-day.store";
import { useSettingsStore } from "@/store/settings.store";
import { useTimerStore } from "@/store/timer.store";

const PX_PER_HOUR = 88;
const DAY_MINUTES = 24 * 60;
const SNAP_MINUTES = 15;
const TRACK_WIDTH = 24 * PX_PER_HOUR;
const EDGE_PX = 8;

type Drag =
  | { mode: "create"; anchor: number; startMin: number; endMin: number }
  | {
      mode: "move" | "resize-start" | "resize-end";
      id: string;
      originStart: number;
      originEnd: number;
      grab: number;
      startMin: number;
      endMin: number;
    };

type AppSpan = { app: string; window: string; start: number; end: number };
/** What the server returned for one day; also the saved copy's shape. */
type TimelineDay = {
  entries: ApiTimeEntry[];
  activity: Awaited<ReturnType<typeof activityApi.getTimeline>>;
  shots: ApiScreenshot[];
};
const TIMELINE_CACHE = "timelineDay";
type MinuteSpan = { startMin: number; endMin: number };

/** Rows are 32px tall; the time bar sits centred in its row. */
const TIME_BAR = "absolute top-[9px] h-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.12)]";
/** Diagonal stripes over a bar: time recorded offline, not uploaded yet. */
const PENDING_STRIPES =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 3px, rgba(255,255,255,0) 3px 7px)";
/** Groups closer than this draw as one item (icon + badge, or a thumbnail stack). */
const APP_SLOT_PX = 30;
const SHOT_SLOT_PX = 28;

type Tone = "productive" | "unproductive" | "logged";
type ToneSpan = { start: number; end: number; tone: Tone };

function toneFrom(value?: string | null): Tone {
  if (value === "PRODUCTIVE") return "productive";
  if (value === "UNPRODUCTIVE" || value === "IDLE") return "unproductive";
  return "logged";
}

function tonePaint(tone: Tone): string {
  if (tone === "productive") return "#10b981";
  if (tone === "unproductive") return "#f43f5e";
  return "#2b7fff";
}

function toneFill(tone: Tone): string {
  if (tone === "productive") return "linear-gradient(180deg, #34d399 0%, #10b981 100%)";
  if (tone === "unproductive") return "linear-gradient(180deg, #fb7185 0%, #f43f5e 100%)";
  return "linear-gradient(180deg, #5b9dff 0%, #2b7fff 100%)";
}

function toneChipClass(tone: Tone): string {
  if (tone === "productive") return "bg-[#10b981]/10 text-[#047857] dark:text-[#6ee7b7]";
  if (tone === "unproductive") return "bg-[#f43f5e]/10 text-[#be123c] dark:text-[#fda4af]";
  return "bg-[#2b7fff]/10 text-[#1d5fd6] dark:text-[#93c5fd]";
}

function pieceShape(index: number, count: number): string {
  if (count <= 1) return "rounded-full";
  if (index === 0) return "rounded-l-full";
  if (index === count - 1) return "rounded-r-full";
  return "";
}

const LANES = [
  { label: "Time", Icon: Clock3, chip: "bg-[#2b7fff]/10 text-[#2b7fff]" },
  { label: "Apps", Icon: AppWindow, chip: "bg-[#10b981]/10 text-[#10b981]" },
  { label: "Shots", Icon: Camera, chip: "bg-[#e2a63b]/15 text-[#c98a1c] dark:text-[#f2c46d]" },
] as const;

function toneLabel(tone: Tone): string {
  if (tone === "productive") return "Productive";
  if (tone === "unproductive") return "Non-productive";
  return "Logged";
}

function formatHm(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function mergeTones(spans: ToneSpan[]): ToneSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: ToneSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.tone === span.tone && span.start <= last.end + 1000) {
      last.end = Math.max(last.end, span.end);
    } else if (last && span.start < last.end) {
      if (span.end > last.end) merged.push({ ...span, start: last.end });
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function slicesFor(startMs: number, endMs: number, tones: ToneSpan[]) {
  const pieces: { startMs: number; endMs: number; tone: Tone }[] = [];
  let cursor = startMs;
  for (const span of tones) {
    const start = Math.max(span.start, startMs);
    const end = Math.min(span.end, endMs);
    if (end <= start || span.tone === "logged") continue;
    if (start > cursor) pieces.push({ startMs: cursor, endMs: start, tone: "logged" });
    const toneStart = Math.max(start, cursor);
    if (end > toneStart) pieces.push({ startMs: toneStart, endMs: end, tone: span.tone });
    cursor = Math.max(cursor, end);
  }
  if (cursor < endMs) pieces.push({ startMs: cursor, endMs: endMs, tone: "logged" });
  return pieces.filter((piece) => piece.endMs > piece.startMs);
}

function apiError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const message = (err as { response?: { data?: { message?: string | string[] } } }).response
      ?.data?.message;
    if (Array.isArray(message)) return message.join(", ");
    if (message) return message;
  }
  return fallback;
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

function startOfZonedDay(ymd: string, timeZone?: string | null): number {
  const zone = timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  let utc = Date.parse(`${ymd}T00:00:00.000Z`);
  for (let i = 0; i < 2; i += 1) {
    utc = Date.parse(`${ymd}T00:00:00.000Z`) - zoneOffsetMs(new Date(utc), zone);
  }
  return utc;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(minutes: number): number {
  return clamp(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES, 0, DAY_MINUTES);
}

function minutesToX(minutes: number): number {
  return (minutes / 60) * PX_PER_HOUR;
}

function clockLabel(ms: number, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone?.trim() || undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function dayHeading(ymd: string, viewingToday: boolean): string {
  if (viewingToday) return "Today";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${ymd}T12:00:00.000Z`));
}

function hourMark(ms: number, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone?.trim() || undefined,
    hour: "numeric",
  }).format(new Date(ms));
}

const tipClass =
  "z-50 rounded-lg border border-[#ededed] bg-white text-[#1e2939] shadow-lg dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#f1f5f9]";

function AppLaneIcon({ name, icon }: { name: string; icon?: string | null }) {
  const [failed, setFailed] = useState(false);
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  if (!icon || failed) {
    return (
      <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md bg-white text-[9px] font-semibold text-[#4a5565] shadow-sm ring-1 ring-black/5 dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:ring-white/10">
        {letter}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt=""
      width={18}
      height={18}
      className="size-[18px] shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm ring-1 ring-black/5 dark:bg-[#1e293b] dark:ring-white/10"
      onError={() => setFailed(true)}
    />
  );
}

/** Placeholder bars for the three rows, spread over the whole day so some show at any scroll. */
const SKELETON_SLOTS = Array.from({ length: 12 }, (_, index) => ({
  startMin: index * 120 + 20 + (index % 3) * 15,
  lengthMin: 45 + ((index * 37) % 50),
}));

function TimelineRowsSkeleton() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
      {SKELETON_SLOTS.map((slot) => (
        <span
          key={`t-${slot.startMin}`}
          className="absolute top-[9px] h-3.5 animate-pulse rounded-full bg-[#e7ebf0] dark:bg-white/[0.08]"
          style={{
            left: minutesToX(slot.startMin),
            width: minutesToX(slot.lengthMin) - minutesToX(0),
          }}
        />
      ))}
      {SKELETON_SLOTS.map((slot) => (
        <span
          key={`a-${slot.startMin}`}
          className="absolute top-[39px] size-[18px] animate-pulse rounded-md bg-[#e7ebf0] dark:bg-white/[0.08]"
          style={{ left: minutesToX(slot.startMin + 10) }}
        />
      ))}
      {SKELETON_SLOTS.map((slot) => (
        <span
          key={`s-${slot.startMin}`}
          className="absolute top-[73px] h-[18px] w-6 animate-pulse rounded bg-[#e7ebf0] dark:bg-white/[0.08]"
          style={{ left: minutesToX(slot.startMin + 25) }}
        />
      ))}
    </div>
  );
}

/**
 * Hover card for a time block: when, how long, how productive, which apps
 * were used and which screenshots were taken during it. Only rendered while
 * open, so the overlap maths runs on hover, not on every redraw.
 */
function TimeBlockCard({
  startMs,
  endMs,
  label,
  live,
  paused,
  apps,
  shots,
  tones,
  appIcons,
  timeZone,
  pending = false,
}: {
  startMs: number;
  endMs: number;
  label: string;
  live: boolean;
  paused: boolean;
  /** Recorded offline, still waiting to upload. */
  pending?: boolean;
  apps: AppSpan[];
  shots: ApiScreenshot[];
  tones: ToneSpan[];
  appIcons: Record<string, string | null>;
  timeZone?: string | null;
}) {
  const duration = Math.max(0, endMs - startMs);

  const split = { productive: 0, unproductive: 0, logged: 0 };
  for (const piece of slicesFor(startMs, endMs, tones)) {
    split[piece.tone] += piece.endMs - piece.startMs;
  }

  const byApp = new Map<string, number>();
  for (const span of apps) {
    const overlap = Math.min(span.end, endMs) - Math.max(span.start, startMs);
    if (overlap > 0) byApp.set(span.app, (byApp.get(span.app) ?? 0) + overlap);
  }
  const topApps = [...byApp.entries()].sort((a, b) => b[1] - a[1]);

  const blockShots = shots
    .map((shot) => ({ shot, at: Date.parse(shot.capturedAt) }))
    .filter((item) => Number.isFinite(item.at) && item.at >= startMs && item.at <= endMs)
    .sort((a, b) => a.at - b.at);

  return (
    <div className="flex w-[232px] flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold leading-4">
            {live ? (
              <span
                className={`size-1.5 shrink-0 rounded-full ${paused ? "bg-[#f59e0b]" : "animate-pulse bg-[#2b7fff]"}`}
              />
            ) : null}
            <span className="truncate">{live ? (paused ? "Paused" : "Timer running") : label}</span>
          </p>
          <p className="text-[10px] leading-4 text-[#4a5565] dark:text-[#94a3b8]">
            {clockLabel(startMs, timeZone)} –{" "}
            {live && !paused ? "now" : clockLabel(endMs, timeZone)}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[#2b7fff]/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-4 text-[#1d5fd6] dark:text-[#93c5fd]">
          {formatHm(duration)}
        </span>
      </div>

      {pending ? (
        <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <CloudUpload className="size-3 shrink-0" aria-hidden />
          Recorded offline · uploads when you&apos;re back online
        </p>
      ) : null}

      {duration > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-[#f1f3f6] dark:bg-white/10">
            {(["productive", "unproductive", "logged"] as const).map((tone) =>
              split[tone] > 0 ? (
                <span
                  key={tone}
                  style={{
                    width: `${(split[tone] / duration) * 100}%`,
                    background: toneFill(tone),
                  }}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 text-[10px] leading-4 text-[#4a5565] dark:text-[#94a3b8]">
            {(["productive", "unproductive", "logged"] as const).map((tone) =>
              split[tone] > 0 ? (
                <span key={tone} className="inline-flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tonePaint(tone) }}
                  />
                  {toneLabel(tone)} <span className="tabular-nums">{formatHm(split[tone])}</span>
                </span>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-[#f1f3f6] pt-2 dark:border-white/10">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[#99a1af] dark:text-[#64748b]">
          Apps
        </p>
        {topApps.length ? (
          topApps.slice(0, 3).map(([app, ms]) => (
            <span key={app} className="flex items-center gap-1.5">
              <AppLaneIcon name={app} icon={appIcons[app]} />
              <span className="min-w-0 truncate text-[11px] font-medium leading-4">{app}</span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums leading-4 text-[#4a5565] dark:text-[#94a3b8]">
                {formatHm(ms)}
              </span>
            </span>
          ))
        ) : (
          <span className="text-[10px] leading-4 text-[#99a1af] dark:text-[#64748b]">
            No app activity recorded
          </span>
        )}
        {topApps.length > 3 ? (
          <span className="text-[10px] leading-4 text-[#99a1af] dark:text-[#64748b]">
            +{topApps.length - 3} more
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 border-t border-[#f1f3f6] pt-2 dark:border-white/10">
        <p className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-[#99a1af] dark:text-[#64748b]">
          Screenshots
          {blockShots.length ? <span className="tabular-nums">{blockShots.length}</span> : null}
        </p>
        {blockShots.length ? (
          <div className="grid grid-cols-3 gap-1">
            {blockShots.slice(0, 3).map(({ shot }, index) => (
              <span
                key={shot.id}
                className="relative aspect-video overflow-hidden rounded bg-[#f1f5f9] ring-1 ring-black/5 dark:bg-[#1e293b] dark:ring-white/10"
              >
                {shot.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot.imageUrl} alt="" className="size-full object-cover" />
                ) : null}
                {index === 2 && blockShots.length > 3 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/60 text-[11px] font-semibold text-white">
                    +{blockShots.length - 3}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] leading-4 text-[#99a1af] dark:text-[#64748b]">
            No screenshots in this block
          </span>
        )}
      </div>
    </div>
  );
}

function mergeApps(spans: AppSpan[]): AppSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: AppSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.app === span.app && span.start - last.end < 20_000) {
      last.end = Math.max(last.end, span.end);
      if (last.window !== span.window) last.window = "";
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** Parts of the running timer that are not already drawn as a saved block. */
function uncoveredLive(live: MinuteSpan, covered: MinuteSpan[]): MinuteSpan[] {
  const gaps: MinuteSpan[] = [];
  let cursor = live.startMin;
  const overlapping = covered
    .filter((span) => span.endMin > live.startMin && span.startMin < live.endMin)
    .sort((a, b) => a.startMin - b.startMin);
  for (const span of overlapping) {
    const start = Math.max(span.startMin, live.startMin);
    const end = Math.min(span.endMin, live.endMin);
    if (start > cursor + 0.25) gaps.push({ startMin: cursor, endMin: start });
    cursor = Math.max(cursor, end);
  }
  if (live.endMin > cursor + 0.25) gaps.push({ startMin: cursor, endMin: live.endMin });
  return gaps;
}

export function DayTimeline() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const orgTimezone = useOrgTimezone();
  const selectedProjectId = useTimerStore((s) => s.selectedProjectId);
  const timer = useTimerStore((s) => s.timer);
  const today = todayInZone(orgTimezone);
  const stripToday = useTimerStore((s) => s.todayDate) || today;
  const pickedDay = useSelectedDayStore((s) => s.ymd);
  const dayFocus = useSelectedDayStore((s) => s.focus);
  const dayYmd = pickedDay && /^\d{4}-\d{2}-\d{2}$/.test(pickedDay) ? pickedDay : stripToday;
  const isViewingToday = dayYmd === today;
  const isFutureDay = dayYmd > today;
  const editSetting = useSettingsStore((s) => s.settings.timelineEditEnabled);
  const dayStart = useMemo(() => startOfZonedDay(dayYmd, orgTimezone), [dayYmd, orgTimezone]);
  const online = useConnectionStore((s) => s.online);
  // Edits go straight to the server, so they wait until it can be reached.
  const canEdit = editSetting && !isFutureDay && online;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const scrollLeftRef = useRef(0);
  const centeredDayRef = useRef("");
  const [entries, setEntries] = useState<ApiTimeEntry[]>([]);
  const [apps, setApps] = useState<AppSpan[]>([]);
  const [tones, setTones] = useState<ToneSpan[]>([]);
  const [appIcons, setAppIcons] = useState<Record<string, string | null>>({});
  const [shots, setShots] = useState<ApiScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hoverBlock, setHoverBlock] = useState<string | null>(null);
  // Set while the day on screen is the saved copy (server unreachable).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [trackedDay, setTrackedDay] = useState(dayYmd);
  if (trackedDay !== dayYmd) {
    setTrackedDay(dayYmd);
    setLoading(true);
  }

  const reload = useCallback(async () => {
    if (!organizationId) {
      setEntries([]);
      setApps([]);
      setTones([]);
      setShots([]);
      setLoading(false);
      return;
    }
    const requested = organizationId;
    const requestedDay = dayYmd;
    const stale = () => {
      if (useAuthStore.getState().organizationId !== requested) return true;
      const picked = useSelectedDayStore.getState().ymd;
      const current =
        picked && /^\d{4}-\d{2}-\d{2}$/.test(picked)
          ? picked
          : useTimerStore.getState().todayDate || todayInZone(orgTimezone);
      return current !== requestedDay;
    };
    // Server first. When it cannot be reached, the saved copy of this day.
    // Either way, work still waiting to upload is drawn on top.
    let day: TimelineDay | null = null;
    let copySavedAt: number | null = null;
    try {
      const [timeRows, activityRows, shotPage] = await Promise.all([
        timesheetApi.listRange(requestedDay, requestedDay),
        activityApi
          .getTimeline({ startDate: requestedDay, endDate: requestedDay })
          .catch(() => null),
        screenshotApi.listDay(requestedDay, 1, 100).catch(() => null),
      ]);
      const saved =
        activityRows && shotPage ? null : readCachedView<TimelineDay>(TIMELINE_CACHE, requestedDay);
      day = {
        entries: timeRows,
        activity: activityRows ?? saved?.data.activity ?? [],
        shots: shotPage?.items ?? saved?.data.shots ?? [],
      };
      if (activityRows && shotPage && !stale()) writeCachedView(TIMELINE_CACHE, requestedDay, day);
    } catch {
      const saved = readCachedView<TimelineDay>(TIMELINE_CACHE, requestedDay);
      if (saved) {
        day = saved.data;
        copySavedAt = saved.savedAt;
      }
    }
    try {
      const dayStartMs = startOfZonedDay(requestedDay, orgTimezone);
      const offline = await loadOfflineOverlay({
        startMs: dayStartMs,
        endMs: dayStartMs + DAY_MINUTES * 60_000,
      });
      if (stale()) return;
      const base: TimelineDay = day ?? { entries: [], activity: [], shots: [] };
      setSavedAt(copySavedAt);
      const timeRows = [...base.entries, ...offline.entries];
      const activityRows: TimelineDay["activity"] = [...base.activity, ...offline.activity];
      const ownShotIds = new Set(offline.shots.map((shot) => shot.id));
      const shotItems = [
        ...offline.shots,
        ...base.shots.filter((shot) => !ownShotIds.has(shot.id)),
      ];
      setEntries(timeRows);
      const activity = activityRows
        .filter((row) => row.start && row.end)
        .map((row) => ({
          ...row,
          startMs: Date.parse(row.start),
          endMs: Date.parse(row.end),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.startMs) && Number.isFinite(row.endMs) && row.endMs > row.startMs,
        );
      setApps(
        mergeApps(
          activity
            .filter((row) => row.app)
            .map((row) => ({
              app: row.app,
              window: row.window || "",
              start: row.startMs,
              end: row.endMs,
            })),
        ),
      );
      setTones(
        mergeTones(
          activity
            .filter((row) => toneFrom(row.productivity) !== "logged")
            .map((row) => ({
              start: row.startMs,
              end: row.endMs,
              tone: toneFrom(row.productivity),
            })),
        ),
      );
      setShots(shotItems);
    } catch {
      if (!stale()) {
        setEntries([]);
        setApps([]);
        setTones([]);
        setShots([]);
        setSavedAt(null);
      }
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [organizationId, orgTimezone, dayYmd]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    const names = [...new Set(apps.map((span) => span.app).filter(Boolean))];
    if (!names.length || !isElectron()) {
      setAppIcons({});
      return;
    }
    const api = getElectronAPI();
    if (!api?.activity?.getAppIcons) return;
    let cancelled = false;
    void api.activity
      .getAppIcons(names)
      .then((icons) => {
        if (!cancelled && icons) setAppIcons(icons);
      })
      .catch(() => {
        if (!cancelled) setAppIcons({});
      });
    return () => {
      cancelled = true;
    };
  }, [apps]);

  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(TIMER_STOPPED_EVENT, onChange);
    window.addEventListener(ACTIVITY_FLUSHED_EVENT, onChange);
    window.addEventListener(SCREENSHOT_CAPTURED_EVENT, onChange);
    window.addEventListener(CONNECTION_RESTORED_EVENT, onChange);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(() => void reload(), 60_000);
    return () => {
      window.removeEventListener(TIMER_STOPPED_EVENT, onChange);
      window.removeEventListener(ACTIVITY_FLUSHED_EVENT, onChange);
      window.removeEventListener(SCREENSHOT_CAPTURED_EVENT, onChange);
      window.removeEventListener(CONNECTION_RESTORED_EVENT, onChange);
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [reload]);

  useEffect(() => {
    setSelectedId(null);
  }, [dayYmd]);

  const toMinutes = useCallback((ms: number) => (ms - dayStart) / 60_000, [dayStart]);

  const latestMinute = isFutureDay
    ? 0
    : isViewingToday
      ? clamp(Math.floor(toMinutes(now)), 0, DAY_MINUTES)
      : DAY_MINUTES;

  const ranges = useMemo(() => {
    return entries.flatMap((entry) => {
      const startMs = Date.parse(entry.startTime);
      const endMs = entry.endTime
        ? Date.parse(entry.endTime)
        : startMs + Math.max(0, entry.duration ?? 0) * 1000;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
      let startMin = toMinutes(startMs);
      let endMin = toMinutes(endMs);
      if (drag && drag.mode !== "create" && drag.id === entry.id) {
        startMin = drag.startMin;
        endMin = drag.endMin;
      }
      if (endMin <= 0 || startMin >= DAY_MINUTES) return [];
      return [
        {
          id: entry.id,
          startMin: clamp(startMin, 0, DAY_MINUTES),
          endMin: clamp(endMin, 0, DAY_MINUTES),
          label: entry.description?.trim() || entry.project?.name || "General",
          pending: isOfflineRowId(entry.id),
        },
      ];
    });
  }, [drag, entries, toMinutes]);

  // While paused, the block and the time pill share the pause instant.
  // Resume grows that same block forward from there.
  const sessionEdgeMs = useMemo(() => {
    if (!isViewingToday || timer.status !== "paused" || !timer.startedAt) return now;
    const pausedMs = timer.pausedAt ? Date.parse(timer.pausedAt) : NaN;
    if (Number.isFinite(pausedMs)) return pausedMs;
    return Date.parse(timer.startedAt) + Math.max(0, timer.elapsedMs);
  }, [isViewingToday, now, timer.elapsedMs, timer.pausedAt, timer.startedAt, timer.status]);

  const live = useMemo(() => {
    if (!isViewingToday) return null;
    if ((timer.status !== "running" && timer.status !== "paused") || !timer.startedAt) return null;
    const startMin = toMinutes(Date.parse(timer.startedAt));
    const endMin = toMinutes(timer.status === "running" ? now : sessionEdgeMs);
    if (endMin <= 0 || startMin >= DAY_MINUTES) return null;
    return {
      startMin: clamp(startMin, 0, DAY_MINUTES),
      endMin: clamp(endMin, 0, DAY_MINUTES),
    };
  }, [isViewingToday, now, sessionEdgeMs, timer.startedAt, timer.status, toMinutes]);

  // Coming back to today should land on the current time, including after that
  // day's bars replace the previous day and the scroller jumps to the start.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const token = `${dayYmd}:${dayFocus}:${loading ? "wait" : "ready"}`;
    if (
      centeredDayRef.current === token ||
      centeredDayRef.current === `${dayYmd}:${dayFocus}:ready`
    ) {
      return;
    }
    const minute = isViewingToday ? clamp(toMinutes(sessionEdgeMs), 0, DAY_MINUTES) : 8 * 60;
    const left = Math.max(0, minutesToX(minute) - el.clientWidth / 2);
    scrollLeftRef.current = left;
    el.scrollLeft = left;
    centeredDayRef.current = token;
  }, [apps, dayFocus, dayYmd, entries, isViewingToday, loading, sessionEdgeMs, shots, toMinutes]);

  const totals = useMemo(() => {
    const blocks = ranges.map((range) => ({
      startMs: dayStart + range.startMin * 60_000,
      endMs: dayStart + range.endMin * 60_000,
    }));
    if (live && live.endMin > live.startMin) {
      for (const gap of uncoveredLive(live, ranges)) {
        blocks.push({
          startMs: dayStart + gap.startMin * 60_000,
          endMs: dayStart + gap.endMin * 60_000,
        });
      }
    }
    let total = 0;
    let productive = 0;
    let unproductive = 0;
    for (const block of blocks) {
      for (const piece of slicesFor(block.startMs, block.endMs, tones)) {
        const ms = piece.endMs - piece.startMs;
        total += ms;
        if (piece.tone === "productive") productive += ms;
        else if (piece.tone === "unproductive") unproductive += ms;
      }
    }
    return { total, productive, unproductive };
  }, [dayStart, live, ranges, tones]);

  const pointerMinutes = (event: ReactPointerEvent | PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(((event.clientX - rect.left) / PX_PER_HOUR) * 60, 0, DAY_MINUTES);
  };

  const placedRange = (current: Drag) => {
    if (
      current.mode !== "create" &&
      current.startMin === current.originStart &&
      current.endMin === current.originEnd
    ) {
      return null;
    }
    let startMin = Math.min(current.startMin, current.endMin);
    let endMin = Math.max(current.startMin, current.endMin);
    if (endMin > latestMinute) {
      const length = endMin - startMin;
      endMin = latestMinute;
      startMin = Math.max(0, endMin - length);
    }
    if (endMin - startMin < SNAP_MINUTES) return null;
    return {
      startMin,
      endMin,
      startTime: new Date(dayStart + startMin * 60_000).toISOString(),
      endTime: new Date(dayStart + endMin * 60_000).toISOString(),
    };
  };

  const finishDrag = async (current: Drag) => {
    const placed = placedRange(current);
    if (!placed) return;

    setSaving(true);
    try {
      if (current.mode === "create") {
        const projectId = isValidProjectId(selectedProjectId) ? selectedProjectId : undefined;
        await timesheetApi.create({
          date: dayYmd,
          startTime: placed.startTime,
          endTime: placed.endTime,
          projectId,
        });
        toast.success("Time added");
      } else {
        await timesheetApi.update(current.id, {
          startTime: placed.startTime,
          endTime: placed.endTime,
        });
        toast.success("Time updated");
      }
      dispatchTimerStopped();
      await reload();
    } catch (err) {
      toast.error(
        apiError(err, current.mode === "create" ? "Could not add time" : "Could not update time"),
      );
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const removeSelected = async () => {
    if (!selectedId || saving || selectedId.startsWith("pending-")) return;
    const id = selectedId;
    setSaving(true);
    setSelectedId(null);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    try {
      await timesheetApi.delete(id);
      toast.success("Time removed");
      dispatchTimerStopped();
      await reload();
    } catch (err) {
      toast.error(apiError(err, "Could not remove time"));
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || saving || event.button !== 0) return;
    const minute = pointerMinutes(event);
    const x = minutesToX(minute);
    const hit = ranges.find((range) => {
      const left = minutesToX(range.startMin);
      const right = minutesToX(range.endMin);
      return x >= left - 2 && x <= right + 2;
    });
    // Offline time is not on the server yet: nothing to move or remove.
    if (hit?.pending) return;
    let next: Drag;
    if (!hit) {
      setSelectedId(null);
      const anchor = snap(Math.min(minute, latestMinute));
      next = { mode: "create", anchor, startMin: anchor, endMin: anchor };
    } else {
      const left = minutesToX(hit.startMin);
      const right = minutesToX(hit.endMin);
      const mode =
        x - left <= EDGE_PX ? "resize-start" : right - x <= EDGE_PX ? "resize-end" : "move";
      next = {
        mode,
        id: hit.id,
        originStart: hit.startMin,
        originEnd: hit.endMin,
        grab: minute - hit.startMin,
        startMin: hit.startMin,
        endMin: hit.endMin,
      };
    }
    dragRef.current = next;
    setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const minute = pointerMinutes(event);
    let next = current;
    if (current.mode === "create") {
      const end = snap(Math.min(minute, latestMinute));
      next = {
        ...current,
        startMin: Math.min(current.anchor, end),
        endMin: Math.max(current.anchor, end),
      };
    } else if (current.mode === "move") {
      const length = current.originEnd - current.originStart;
      let startMin = snap(minute - current.grab);
      startMin = clamp(startMin, 0, DAY_MINUTES - length);
      next = { ...current, startMin, endMin: startMin + length };
    } else if (current.mode === "resize-start") {
      const startMin = clamp(snap(minute), 0, current.originEnd - SNAP_MINUTES);
      next = { ...current, startMin, endMin: current.originEnd };
    } else {
      const endMin = clamp(
        snap(Math.min(minute, latestMinute)),
        current.originStart + SNAP_MINUTES,
        DAY_MINUTES,
      );
      next = { ...current, startMin: current.originStart, endMin };
    }
    dragRef.current = next;
    setDrag(next);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = scrollLeftRef.current;
  };

  const onPointerUp = () => {
    const current = dragRef.current;
    dragRef.current = null;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = scrollLeftRef.current;
    if (!current) {
      setDrag(null);
      return;
    }
    const placed = placedRange(current);
    if (!placed) {
      setDrag(null);
      if (current.mode !== "create") setSelectedId(current.id);
      return;
    }
    if (current.mode === "create") {
      setEntries((prev) => [
        ...prev,
        {
          id: `pending-${current.anchor}`,
          date: dayYmd,
          startTime: placed.startTime,
          endTime: placed.endTime,
        },
      ]);
      setSelectedId(null);
    } else {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === current.id
            ? { ...entry, startTime: placed.startTime, endTime: placed.endTime }
            : entry,
        ),
      );
    }
    setDrag(null);
    void finishDrag(current);
  };

  const nowX = minutesToX(toMinutes(sessionEdgeMs));
  const showNow = isViewingToday && nowX >= 0 && nowX <= TRACK_WIDTH;
  const selected = ranges.find((range) => range.id === selectedId) ?? null;

  const appClusters = clusterApps(
    apps.flatMap((span) => {
      const startMin = toMinutes(span.start);
      const endMin = toMinutes(span.end);
      if (endMin <= 0 || startMin >= DAY_MINUTES) return [];
      return [
        {
          ...span,
          left: minutesToX(clamp(startMin, 0, DAY_MINUTES)),
          right: minutesToX(clamp(endMin, 0, DAY_MINUTES)),
        },
      ];
    }),
    APP_SLOT_PX,
  );

  const shotClusters = clusterShots(
    shots.flatMap((shot) => {
      const capturedMs = Date.parse(shot.capturedAt);
      const minute = toMinutes(capturedMs);
      if (!Number.isFinite(minute) || minute < 0 || minute > DAY_MINUTES) return [];
      return [{ id: shot.id, x: minutesToX(minute), capturedMs, shot }];
    }),
    SHOT_SLOT_PX,
  );

  const liveDotX = live && timer.status === "running" ? minutesToX(live.endMin) : null;
  // Placeholder bars only while the day has nothing to draw yet.
  const firstLoad = loading && !entries.length && !apps.length && !shots.length && !live;

  /** Wraps a time bar in its hover card. Hidden while dragging so it never covers the drag. */
  const withBlockCard = (
    key: string,
    block: { startMs: number; endMs: number; label: string; live: boolean; pending?: boolean },
    bar: ReactElement,
  ) => (
    <Tooltip
      key={key}
      open={!drag && hoverBlock === key}
      onOpenChange={(open) => setHoverBlock(open ? key : null)}
      delayDuration={150}
    >
      <TooltipTrigger asChild>{bar}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={10}
        collisionPadding={8}
        className={`${tipClass} p-2.5`}
      >
        <TimeBlockCard
          {...block}
          paused={block.live && timer.status === "paused"}
          apps={apps}
          shots={shots}
          tones={tones}
          appIcons={appIcons}
          timeZone={orgTimezone}
        />
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold leading-4 text-[#1e2939] dark:text-[#f1f5f9]">
            {dayHeading(dayYmd, isViewingToday)}
          </p>
          <p className="text-[11px] leading-4 text-[#6a7282] dark:text-[#94a3b8]">
            Total{" "}
            <span className="text-xs font-semibold tabular-nums text-[#1e2939] dark:text-[#f1f5f9]">
              {firstLoad ? (
                <span
                  className="inline-block h-3 w-10 animate-pulse rounded bg-[#eef1f5] align-middle dark:bg-white/[0.07]"
                  aria-label="Loading"
                />
              ) : (
                formatHm(totals.total)
              )}
            </span>
          </p>
        </div>
        <SavedCopyNote savedAt={savedAt} />
        <p className="flex flex-wrap items-center gap-1 text-[10px] leading-4">
          {(["productive", "unproductive", "logged"] as const).map((tone) => (
            <span
              key={tone}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${toneChipClass(tone)}`}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tonePaint(tone) }}
              />
              {toneLabel(tone)}
              <span className="tabular-nums">
                {formatHm(
                  tone === "productive"
                    ? totals.productive
                    : tone === "unproductive"
                      ? totals.unproductive
                      : Math.max(0, totals.total - totals.productive - totals.unproductive),
                )}
              </span>
            </span>
          ))}
        </p>
      </div>
      <div className="flex gap-2">
        {/* 24px hour header + 1px card border, so labels line up with the rows */}
        <div className="flex w-[54px] shrink-0 flex-col pt-[25px] text-[10px] font-medium leading-4 text-[#4a5565] dark:text-[#94a3b8]">
          {LANES.map(({ label, Icon, chip }) => (
            <span key={label} className="flex h-8 items-center gap-1.5">
              <span className={`flex size-[18px] items-center justify-center rounded-md ${chip}`}>
                <Icon className="size-3" strokeWidth={2.25} />
              </span>
              {label}
            </span>
          ))}
        </div>
        <div
          ref={scrollerRef}
          className="timeline-scroll min-w-0 flex-1 overflow-x-auto pb-1.5 [overflow-anchor:none] [scroll-behavior:auto]"
          onScroll={(event) => {
            if (dragRef.current) {
              event.currentTarget.scrollLeft = scrollLeftRef.current;
              return;
            }
            scrollLeftRef.current = event.currentTarget.scrollLeft;
          }}
        >
          <div className="relative" style={{ width: TRACK_WIDTH }}>
            <div className="relative h-6">
              {Array.from({ length: 12 }, (_, index) => {
                const hour = index * 2;
                return (
                  <span
                    key={hour}
                    className="absolute top-1 whitespace-nowrap text-[10px] font-medium leading-4 text-[#99a1af] dark:text-[#64748b]"
                    style={{ left: hour * PX_PER_HOUR + 4 }}
                  >
                    {hourMark(dayStart + hour * 60 * 60 * 1000, orgTimezone)}
                  </span>
                );
              })}
              {showNow ? (
                <span
                  className="absolute top-0.5 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2b7fff] px-2 text-[10px] font-semibold leading-4 text-white shadow-[0_2px_6px_rgba(43,127,255,0.35)]"
                  style={{ left: nowX }}
                >
                  {clockLabel(sessionEdgeMs, orgTimezone)}
                </span>
              ) : null}
            </div>

            <div className="relative overflow-hidden rounded-xl border border-[#eceef2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#334155] dark:bg-[#0f172a]/60">
              {/* Hour grid shared by all rows: soft bands every other hour + hairlines. */}
              <div className="pointer-events-none absolute inset-0">
                {Array.from({ length: 12 }, (_, index) => (
                  <span
                    key={`band-${index}`}
                    className="absolute inset-y-0 bg-[#f8fafc] dark:bg-white/[0.025]"
                    style={{ left: (index * 2 + 1) * PX_PER_HOUR, width: PX_PER_HOUR }}
                  />
                ))}
                {Array.from({ length: 24 }, (_, hour) => (
                  <span
                    key={`line-${hour}`}
                    className="absolute inset-y-0 w-px bg-[#eef1f5] dark:bg-white/5"
                    style={{ left: hour * PX_PER_HOUR }}
                  />
                ))}
              </div>
              {showNow ? (
                <span
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-gradient-to-b from-[#2b7fff] to-[#2b7fff]/30"
                  style={{ left: nowX }}
                />
              ) : null}

              {firstLoad ? <TimelineRowsSkeleton /> : null}

              <div
                ref={trackRef}
                className={`relative h-8 ${saving ? "pointer-events-none opacity-70" : canEdit ? "cursor-crosshair" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {live && live.endMin > live.startMin
                  ? uncoveredLive(live, ranges).flatMap((gap) => {
                      const pieces = slicesFor(
                        dayStart + gap.startMin * 60_000,
                        dayStart + gap.endMin * 60_000,
                        tones,
                      );
                      return pieces.map((piece, index) => {
                        const startMin = toMinutes(piece.startMs);
                        const endMin = toMinutes(piece.endMs);
                        return withBlockCard(
                          `live-${piece.startMs}`,
                          {
                            startMs: dayStart + live.startMin * 60_000,
                            endMs: dayStart + live.endMin * 60_000,
                            label: "Timer running",
                            live: true,
                          },
                          <span
                            className={`${TIME_BAR} ${pieceShape(index, pieces.length)} cursor-default transition-[filter] hover:brightness-110`}
                            style={{
                              left: minutesToX(startMin),
                              width: Math.max(6, minutesToX(endMin) - minutesToX(startMin)),
                              background: toneFill(piece.tone),
                            }}
                          />,
                        );
                      });
                    })
                  : null}
                {ranges.flatMap((range) => {
                  const pieces = slicesFor(
                    dayStart + range.startMin * 60_000,
                    dayStart + range.endMin * 60_000,
                    tones,
                  );
                  return pieces.map((piece, index) => {
                    const startMin = toMinutes(piece.startMs);
                    const endMin = toMinutes(piece.endMs);
                    return withBlockCard(
                      `${range.id}-${index}`,
                      {
                        startMs: dayStart + range.startMin * 60_000,
                        endMs: dayStart + range.endMin * 60_000,
                        label: range.label,
                        live: false,
                        pending: range.pending,
                      },
                      <span
                        className={`${TIME_BAR} ${pieceShape(index, pieces.length)} transition-[filter] hover:brightness-110 ${canEdit && !range.pending ? "cursor-grab" : "cursor-default"} ${range.pending ? "opacity-80" : ""} ${canEdit && range.id === selectedId ? "ring-2 ring-[#2b7fff]/70 ring-offset-1 ring-offset-white dark:ring-offset-[#0f172a]" : ""}`}
                        style={{
                          left: minutesToX(startMin),
                          width: Math.max(6, minutesToX(endMin) - minutesToX(startMin)),
                          background: range.pending
                            ? `${PENDING_STRIPES}, ${toneFill(piece.tone)}`
                            : toneFill(piece.tone),
                        }}
                      />,
                    );
                  });
                })}
                {drag?.mode === "create" && drag.endMin > drag.startMin ? (
                  <span
                    className="pointer-events-none absolute top-[7px] h-[18px] rounded-full border border-dashed border-[#2b7fff] bg-[#2b7fff]/10"
                    style={{
                      left: minutesToX(drag.startMin),
                      width: Math.max(8, minutesToX(drag.endMin) - minutesToX(drag.startMin)),
                    }}
                  />
                ) : null}
                {liveDotX !== null ? (
                  <span
                    className="pointer-events-none absolute top-1/2 z-20 flex size-2.5 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: liveDotX }}
                  >
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2b7fff] opacity-50" />
                    <span className="relative inline-flex size-2.5 rounded-full border-2 border-white bg-[#2b7fff] dark:border-[#0f172a]" />
                  </span>
                ) : null}
              </div>

              <div className="relative h-8 border-t border-[#f1f3f6] dark:border-white/5">
                {appClusters.map((cluster) => {
                  const top = cluster.usage[0];
                  const extra = cluster.usage.length - 1;
                  const width = Math.max(18, cluster.right - cluster.left);
                  const when = `${clockLabel(cluster.start, orgTimezone)} – ${clockLabel(cluster.end, orgTimezone)}`;
                  const onlySpan = cluster.spans.length === 1 ? cluster.spans[0] : null;
                  return (
                    <Tooltip key={cluster.key}>
                      <TooltipTrigger asChild>
                        <span
                          className="absolute top-1/2 flex h-5 -translate-y-1/2 cursor-default items-center outline-none"
                          style={{ left: cluster.left, width }}
                        >
                          <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#10b981]/20 dark:bg-[#10b981]/25" />
                          <span className="relative flex items-center">
                            <AppLaneIcon name={top.app} icon={appIcons[top.app]} />
                            {extra > 0 ? (
                              <span className="relative -ml-1 rounded-full bg-[#1e2939] px-1 text-[8px] font-semibold leading-3 text-white ring-2 ring-white dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:ring-[#0f172a]">
                                +{extra}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={8}
                        className={`${tipClass} px-2 py-1.5`}
                      >
                        {onlySpan ? (
                          <>
                            <span className="flex items-center gap-1.5">
                              <AppLaneIcon name={onlySpan.app} icon={appIcons[onlySpan.app]} />
                              <span className="text-[11px] font-medium leading-4">
                                {onlySpan.app}
                              </span>
                            </span>
                            <span className="mt-0.5 block max-w-[220px] truncate text-[10px] leading-4 text-[#4a5565] dark:text-[#94a3b8]">
                              {onlySpan.window ? `${onlySpan.window} · ${when}` : when}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex flex-col gap-1">
                              {cluster.usage.slice(0, 5).map((usage) => (
                                <span key={usage.app} className="flex items-center gap-1.5">
                                  <AppLaneIcon name={usage.app} icon={appIcons[usage.app]} />
                                  <span className="max-w-[140px] truncate text-[11px] font-medium leading-4">
                                    {usage.app}
                                  </span>
                                  <span className="ml-auto pl-2 text-[10px] tabular-nums leading-4 text-[#4a5565] dark:text-[#94a3b8]">
                                    {formatHm(usage.ms)}
                                  </span>
                                </span>
                              ))}
                            </span>
                            <span className="mt-1 block border-t border-[#f1f3f6] pt-1 text-[10px] leading-4 text-[#4a5565] dark:border-white/10 dark:text-[#94a3b8]">
                              {cluster.usage.length > 5
                                ? `+${cluster.usage.length - 5} more · `
                                : ""}
                              {when}
                            </span>
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="relative h-8 border-t border-[#f1f3f6] dark:border-white/5">
                {shotClusters.map((cluster) => {
                  const first = cluster.items[0];
                  const last = cluster.items[cluster.items.length - 1];
                  const count = cluster.items.length;
                  const when =
                    count === 1
                      ? clockLabel(first.capturedMs, orgTimezone)
                      : `${clockLabel(first.capturedMs, orgTimezone)} – ${clockLabel(last.capturedMs, orgTimezone)}`;
                  return (
                    <Tooltip key={cluster.key}>
                      <TooltipTrigger asChild>
                        <span
                          className="absolute top-1/2 size-[22px] -translate-x-1/2 -translate-y-1/2 cursor-default outline-none"
                          style={{ left: cluster.x }}
                        >
                          {count > 1 ? (
                            <span className="absolute inset-0 -translate-y-[2px] translate-x-[3px] rotate-6 rounded-md bg-[#e5e7eb] ring-1 ring-black/5 dark:bg-[#334155] dark:ring-white/10" />
                          ) : null}
                          <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-md bg-[#f1f5f9] shadow-sm ring-2 ring-white dark:bg-[#1e293b] dark:ring-[#0f172a]">
                            {first.shot.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={first.shot.imageUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <Camera className="size-3 text-[#99a1af]" />
                            )}
                          </span>
                          {count > 1 ? (
                            <span className="absolute -right-1.5 -top-1.5 z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#e2a63b] px-1 text-[8px] font-semibold leading-none text-white ring-2 ring-white dark:ring-[#0f172a]">
                              {count}
                            </span>
                          ) : null}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={8}
                        className={`${tipClass} w-[208px] p-1.5`}
                      >
                        {count === 1 ? (
                          first.shot.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={first.shot.imageUrl}
                              alt=""
                              className="max-h-[112px] w-full rounded-md bg-[#0f172a] object-contain"
                            />
                          ) : null
                        ) : (
                          <span className="grid grid-cols-2 gap-1">
                            {cluster.items.slice(0, 4).map((item) =>
                              item.shot.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={item.id}
                                  src={item.shot.imageUrl}
                                  alt=""
                                  className="aspect-video w-full rounded bg-[#0f172a] object-cover"
                                />
                              ) : (
                                <span
                                  key={item.id}
                                  className="aspect-video w-full rounded bg-[#f1f5f9] dark:bg-[#1e293b]"
                                />
                              ),
                            )}
                          </span>
                        )}
                        <span className="block truncate px-0.5 pt-1 text-[11px] font-medium leading-4">
                          {count === 1
                            ? first.shot.appName || "Screenshot"
                            : `${count} screenshots${count > 4 ? ` (showing 4)` : ""}`}
                        </span>
                        <span className="block px-0.5 text-[10px] leading-4 text-[#4a5565] dark:text-[#94a3b8]">
                          {when}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {canEdit && selected ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-4 text-[#4a5565] dark:text-[#94a3b8]">
            {clockLabel(dayStart + selected.startMin * 60_000, orgTimezone)}
            {" – "}
            {clockLabel(dayStart + selected.endMin * 60_000, orgTimezone)}
          </p>
          <button
            type="button"
            disabled={saving || selected.id.startsWith("pending-")}
            onClick={() => void removeSelected()}
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#e07a7a] hover:bg-[#e07a7a]/10 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-[11px] leading-4 text-[#99a1af] dark:text-[#64748b]">
          {loading ? (
            <span
              className="inline-block h-3 w-52 animate-pulse rounded bg-[#eef1f5] align-middle dark:bg-white/[0.07]"
              aria-label="Loading"
            />
          ) : drag ? (
            `${clockLabel(dayStart + drag.startMin * 60_000, orgTimezone)} – ${clockLabel(dayStart + drag.endMin * 60_000, orgTimezone)}`
          ) : !canEdit ? (
            isFutureDay ? (
              "This day has not started."
            ) : !online && editSetting ? (
              "Adding, moving and removing time is available when you're back online."
            ) : (
              "Turn on Edit and delete timeline in Settings to add or remove time."
            )
          ) : (
            "Drag empty time to add it. Drag a blue block to move it. Click a block to remove it."
          )}
        </p>
      )}
    </div>
  );
}
