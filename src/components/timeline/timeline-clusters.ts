/**
 * Groups timeline items that would draw on top of each other.
 *
 * At 88px per hour, screenshots a few minutes apart (or short app switches)
 * land a few pixels apart and pile into an unreadable stack. Items are joined
 * while they start within `slotPx` of the group's first item, so one group
 * never grows wider than a single slot and groups stay evenly spread.
 */

export type ShotLike = { id: string; x: number };

export type ShotCluster<T extends ShotLike> = {
  key: string;
  /** Centre of the group, in px from the start of the day. */
  x: number;
  items: T[];
};

export function clusterShots<T extends ShotLike>(shots: T[], slotPx: number): ShotCluster<T>[] {
  const sorted = [...shots].sort((a, b) => a.x - b.x);
  const clusters: ShotCluster<T>[] = [];
  let anchor = Number.NEGATIVE_INFINITY;
  for (const shot of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && shot.x - anchor < slotPx) {
      last.items.push(shot);
    } else {
      anchor = shot.x;
      clusters.push({ key: shot.id, x: shot.x, items: [shot] });
    }
  }
  for (const cluster of clusters) {
    const xs = cluster.items.map((item) => item.x);
    cluster.x = (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  return clusters;
}

export type AppLike = {
  app: string;
  window: string;
  start: number;
  end: number;
  left: number;
  right: number;
};

export type AppUsage = { app: string; ms: number };

export type AppCluster<T extends AppLike> = {
  key: string;
  left: number;
  right: number;
  start: number;
  end: number;
  /** Apps in the group, most used first. */
  usage: AppUsage[];
  spans: T[];
};

export function clusterApps<T extends AppLike>(spans: T[], slotPx: number): AppCluster<T>[] {
  const sorted = [...spans].sort((a, b) => a.left - b.left);
  const clusters: AppCluster<T>[] = [];
  for (const span of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && span.left - last.left < slotPx) {
      last.spans.push(span);
      last.right = Math.max(last.right, span.right);
      last.start = Math.min(last.start, span.start);
      last.end = Math.max(last.end, span.end);
    } else {
      clusters.push({
        key: `${span.app}-${span.start}`,
        left: span.left,
        right: span.right,
        start: span.start,
        end: span.end,
        usage: [],
        spans: [span],
      });
    }
  }
  for (const cluster of clusters) {
    const byApp = new Map<string, number>();
    for (const span of cluster.spans) {
      byApp.set(span.app, (byApp.get(span.app) ?? 0) + Math.max(0, span.end - span.start));
    }
    cluster.usage = [...byApp.entries()]
      .map(([app, ms]) => ({ app, ms }))
      .sort((a, b) => b.ms - a.ms);
  }
  return clusters;
}
