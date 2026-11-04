/**
 * Floating status card on top of every screen: says when the app is
 * offline, that tracking continues and how much work waits to upload.
 * After the connection returns it shows the upload, then "Back online"
 * for a moment.
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Camera, CheckCircle2, Clock3, CloudUpload, WifiOff, type LucideIcon } from "lucide-react";
import { dayjs } from "@/lib/dayjs";
import { useAuthStore } from "@/store/auth.store";
import { totalPending, useConnectionStore } from "@/store/connection.store";

/** How long "Back online" stays after everything is uploaded. */
const RESTORED_VISIBLE_MS = 4_000;
const UPLOADING_VISIBLE_MAX_MS = 2 * 60_000;

type Tone = "offline" | "syncing" | "done";

const TONES: Record<Tone, { surface: string; tile: string }> = {
  offline: {
    surface:
      "border-slate-200 bg-gradient-to-r from-slate-100 via-white to-white dark:border-slate-400/20 dark:from-slate-400/[0.10] dark:via-[#111a2b] dark:to-[#111a2b]",
    // Silver: offline is a state, not an error.
    tile: "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-[0_2px_8px_rgba(100,116,139,0.35)] dark:from-slate-400 dark:to-slate-600",
  },
  syncing: {
    surface:
      "border-blue-200/80 bg-gradient-to-r from-blue-50 via-white to-white dark:border-blue-400/20 dark:from-blue-500/[0.10] dark:via-[#111a2b] dark:to-[#111a2b]",
    tile: "bg-gradient-to-br from-[#5b9dff] to-[#2b7fff] text-white shadow-[0_2px_8px_rgba(43,127,255,0.35)]",
  },
  done: {
    surface:
      "border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-white dark:border-emerald-400/20 dark:from-emerald-500/[0.10] dark:via-[#111a2b] dark:to-[#111a2b]",
    tile: "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]",
  },
};

function BannerCard({
  tone,
  icon: Icon,
  title,
  meta,
  subtitle,
  aside,
  progress,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  meta?: string | null;
  subtitle?: string;
  aside?: ReactNode;
  progress?: boolean;
}) {
  const palette = TONES[tone];
  return (
    <div className="sticky top-0 z-40 mx-auto w-full max-w-[430px] px-3">
      <div
        role="status"
        aria-live="polite"
        className={`relative flex items-center gap-2.5 overflow-hidden rounded-xl border py-2 pl-2 pr-2.5 shadow-[0_4px_14px_rgba(16,24,40,0.08)] backdrop-blur-md dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] ${palette.surface}`}
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${palette.tile}`}
        >
          <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs font-semibold leading-4 text-[#1e2939] dark:text-[#f1f5f9]">
            {title}
            {meta ? (
              <span className="truncate text-[10px] font-medium text-[#99a1af] dark:text-[#64748b]">
                {meta}
              </span>
            ) : null}
          </p>
          {subtitle ? (
            <p className="truncate text-[10px] leading-[14px] text-[#6a7282] dark:text-[#94a3b8]">
              {subtitle}
            </p>
          ) : null}
        </div>

        {aside}

        {progress ? (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[#2b7fff]/10"
          >
            <span className="block h-full w-1/3 rounded-full bg-[#2b7fff] motion-safe:animate-[banner-progress_1.2s_ease-in-out_infinite]" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CountChip({
  icon: Icon,
  count,
  label,
}: {
  icon: LucideIcon;
  count: number;
  label: string;
}) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-md bg-[#f4f6f9] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-4 text-[#4a5565] ring-1 ring-inset ring-[#e8ebf0] dark:bg-white/[0.05] dark:text-[#cbd5e1] dark:ring-white/10"
    >
      <Icon className="size-3 text-[#99a1af] dark:text-[#64748b]" strokeWidth={2.25} aria-hidden />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ConnectionBanner() {
  const online = useConnectionStore((s) => s.online);
  const offlineSince = useConnectionStore((s) => s.offlineSince);
  const restoredAt = useConnectionStore((s) => s.restoredAt);
  const pending = useConnectionStore((s) => s.pending);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // The reconnect (by its restoredAt) whose upload is finished or given up on.
  const [settledFor, setSettledFor] = useState<number | null>(null);
  const [restoredDone, setRestoredDone] = useState(false);

  const waiting = totalPending(pending);
  const reconnecting = online && restoredAt !== null && settledFor !== restoredAt;
  const uploading = reconnecting && waiting > 0;

  // Queue empty after a reconnect: show "Back online" for a moment, once.
  useEffect(() => {
    if (!reconnecting || waiting > 0 || restoredAt === null) return;
    setSettledFor(restoredAt);
    setRestoredDone(true);
  }, [reconnecting, restoredAt, waiting]);

  useEffect(() => {
    if (!restoredDone) return;
    const id = window.setTimeout(() => setRestoredDone(false), RESTORED_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [restoredDone]);

  // Never keep "uploading" up for long: items the server keeps refusing
  // stay queued, and the next reconnect tries again.
  useEffect(() => {
    if (!reconnecting || restoredAt === null) return;
    const id = window.setTimeout(() => setSettledFor(restoredAt), UPLOADING_VISIBLE_MAX_MS);
    return () => window.clearTimeout(id);
  }, [reconnecting, restoredAt]);

  useEffect(() => {
    if (!online) setRestoredDone(false);
  }, [online]);

  if (!online) {
    const since = offlineSince ? `since ${dayjs(offlineSince).format("h:mm A")}` : null;
    const chips =
      isAuthenticated && (pending.screenshots > 0 || pending.time > 0) ? (
        <span className="flex shrink-0 items-center gap-1">
          {pending.screenshots > 0 ? (
            <CountChip
              icon={Camera}
              count={pending.screenshots}
              label={`${plural(pending.screenshots, "screenshot")} waiting to upload`}
            />
          ) : null}
          {pending.time > 0 ? (
            <CountChip
              icon={Clock3}
              count={pending.time}
              label={`${plural(pending.time, "timer update")} waiting to upload`}
            />
          ) : null}
        </span>
      ) : null;
    return (
      <BannerCard
        tone="offline"
        icon={WifiOff}
        title="You're offline"
        meta={since}
        subtitle={
          isAuthenticated
            ? "Tracking continues · saved on this laptop"
            : "Connect to the internet to sign in"
        }
        aside={chips}
      />
    );
  }

  if (uploading) {
    return (
      <BannerCard
        tone="syncing"
        icon={CloudUpload}
        title="Back online"
        subtitle="Uploading your saved work…"
        aside={
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#2b7fff]">
            {plural(waiting, "item")} left
          </span>
        }
        progress
      />
    );
  }

  if (restoredDone) {
    return (
      <BannerCard
        tone="done"
        icon={CheckCircle2}
        title="Back online"
        subtitle="Everything is uploaded"
      />
    );
  }

  return null;
}
