/**
 * Characterization tests for the idle pause/resume retry queue (src/lib/timer-outbox.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimerOutbox, isRetryableError, type TimerOp } from "@/lib/timer-outbox";

const httpError = (status: number) => ({ response: { status } });
const op = (kind: TimerOp["kind"], minute: number): TimerOp => ({
  kind,
  occurredAt: `2026-11-03T09:${String(minute).padStart(2, "0")}:00.000Z`,
});

describe("isRetryableError", () => {
  it("retries when there is no response (offline, timeout)", () => {
    expect(isRetryableError(new Error("Network Error"))).toBe(true);
    expect(isRetryableError(null)).toBe(true);
    expect(isRetryableError("boom")).toBe(true);
  });

  it("retries server errors, timeouts and rate limits", () => {
    for (const status of [500, 502, 503, 408, 429]) {
      expect(isRetryableError(httpError(status))).toBe(true);
    }
  });

  it("does not retry client errors", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryableError(httpError(status))).toBe(false);
    }
  });
});

describe("createTimerOutbox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends ops in submit order with their original time", async () => {
    const sent: TimerOp[] = [];
    const outbox = createTimerOutbox({ send: async (o) => void sent.push(o) });

    outbox.submit(op("pause", 1));
    outbox.submit(op("resume", 2));
    await vi.runAllTimersAsync();

    expect(sent).toEqual([op("pause", 1), op("resume", 2)]);
    expect(outbox.pending()).toBe(0);
  });

  it("keeps a failed op at the front and retries it before later ops", async () => {
    const sent: string[] = [];
    let failFirst = true;
    const outbox = createTimerOutbox({
      retryMs: 1_000,
      send: async (o) => {
        if (failFirst && o.kind === "pause") {
          failFirst = false;
          throw new Error("offline");
        }
        sent.push(o.kind);
      },
    });

    outbox.submit(op("pause", 1));
    outbox.submit(op("resume", 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([]);
    expect(outbox.pending()).toBe(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toEqual(["pause", "resume"]);
  });

  it("drops an op the server rejects for good and moves on", async () => {
    const onDropped = vi.fn();
    const sent: string[] = [];
    const outbox = createTimerOutbox({
      onDropped,
      send: async (o) => {
        if (o.kind === "pause") throw httpError(409);
        sent.push(o.kind);
      },
    });

    outbox.submit(op("pause", 1));
    outbox.submit(op("resume", 2));
    await vi.runAllTimersAsync();

    expect(onDropped).toHaveBeenCalledWith(op("pause", 1), httpError(409));
    expect(sent).toEqual(["resume"]);
  });

  it("reports how many ops remain after each success", async () => {
    const remaining: number[] = [];
    const outbox = createTimerOutbox({
      send: async () => "ok",
      onApplied: (_r, _o, left) => remaining.push(left),
    });
    outbox.submit(op("pause", 1));
    outbox.submit(op("resume", 2));
    await vi.runAllTimersAsync();
    expect(remaining.at(-1)).toBe(0);
  });

  it("clear empties the queue and cancels the pending retry", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    const outbox = createTimerOutbox({ retryMs: 1_000, send });

    outbox.submit(op("pause", 1));
    await vi.advanceTimersByTimeAsync(0);
    outbox.clear();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(outbox.pending()).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
