import { describe, expect, it } from "vitest";
import { formatActivityPercent } from "@/lib/activity-percent";

describe("formatActivityPercent", () => {
  it("drops the decimal for whole numbers", () => {
    expect(formatActivityPercent(42)).toBe("42");
    expect(formatActivityPercent(41.96)).toBe("42");
  });

  it("keeps one decimal otherwise", () => {
    expect(formatActivityPercent(41.94)).toBe("41.9");
    expect(formatActivityPercent(0.05)).toBe("0.1");
  });
});
