/**
 * Timeline grouping: nearby screenshots / app icons draw as one item instead
 * of piling on top of each other.
 */
import { describe, expect, it } from "vitest";
import { clusterApps, clusterShots } from "@/components/timeline/timeline-clusters";

const PX_PER_MIN = 88 / 60;

describe("clusterShots", () => {
  it("keeps shots that are far apart separate", () => {
    const groups = clusterShots(
      [
        { id: "a", x: 100 },
        { id: "b", x: 200 },
      ],
      28,
    );
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["a"], ["b"]]);
    expect(groups[0].x).toBe(100);
  });

  it("joins shots a few minutes apart and centres the group", () => {
    const groups = clusterShots(
      [
        { id: "b", x: 105 },
        { id: "a", x: 100 },
        { id: "c", x: 110 },
      ],
      28,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(groups[0].x).toBe(105);
  });

  it("does not chain an hour of 3-minute shots into one group", () => {
    const shots = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, x: i * 3 * PX_PER_MIN }));
    const groups = clusterShots(shots, 28);
    // ~88px of shots in 28px slots → 3 groups, not one big pile.
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      const xs = group.items.map((i) => i.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(28);
    }
    expect(groups.flatMap((g) => g.items)).toHaveLength(20);
  });

  it("handles no shots", () => {
    expect(clusterShots([], 28)).toEqual([]);
  });
});

describe("clusterApps", () => {
  const span = (app: string, startMin: number, endMin: number) => ({
    app,
    window: "",
    start: startMin * 60_000,
    end: endMin * 60_000,
    left: startMin * PX_PER_MIN,
    right: endMin * PX_PER_MIN,
  });

  it("groups quick app switches and lists the most used app first", () => {
    const groups = clusterApps(
      [span("Chrome", 0, 1), span("Code", 1, 6), span("Chrome", 6, 7)],
      30,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].usage).toEqual([
      { app: "Code", ms: 5 * 60_000 },
      { app: "Chrome", ms: 2 * 60_000 },
    ]);
    expect(groups[0].start).toBe(0);
    expect(groups[0].end).toBe(7 * 60_000);
    expect(groups[0].right).toBeCloseTo(7 * PX_PER_MIN);
  });

  it("keeps long, separate app sessions apart", () => {
    const groups = clusterApps([span("Code", 0, 60), span("Figma", 60, 120)], 30);
    expect(groups.map((g) => g.usage[0].app)).toEqual(["Code", "Figma"]);
  });
});
