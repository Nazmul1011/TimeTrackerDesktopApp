/**
 * Input validation for IPC payloads coming from the renderer.
 * Schemas accept everything the renderer sends today (nulls and missing
 * fields included) and reject wrong types, oversized strings, and non-http
 * API URLs (tokens and screenshots are sent to apiBaseUrl).
 */
import { z } from "zod";
import log from "electron-log/main";

const MAX_TOKEN = 16_384;
const MAX_ID = 256;

const token = z.string().max(MAX_TOKEN).nullish();
const id = z.string().max(MAX_ID).nullish();

export const httpUrl = z
  .string()
  .max(2_048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an http(s) URL");

export const authSessionSchema = z.object({
  accessToken: token,
  refreshToken: token,
  sessionToken: token,
  organizationId: id,
  user: z.unknown().optional(),
  organizations: z.array(z.unknown()).nullish(),
});

export const trackingAuthSchema = z.object({
  accessToken: token,
  refreshToken: token,
  sessionToken: token,
  organizationId: id,
  deviceId: id,
  apiBaseUrl: httpUrl.nullish(),
});

const durationMs = z
  .number()
  .finite()
  .min(0)
  .max(7 * 24 * 60 * 60_000);

export const trackingStartSchema = trackingAuthSchema.extend({
  screenshotIntervalMs: durationMs.optional(),
  enableScreenshots: z.boolean().optional(),
  firstScreenshotDelayMs: durationMs.optional(),
  idleTimeoutMs: durationMs.optional(),
});

export const revealSchema = z
  .object({
    delayMs: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 * 60_000)
      .optional(),
  })
  .nullish();

export const notificationSchema = z
  .object({
    title: z.string().max(1_000).optional(),
    body: z.string().max(10_000).optional(),
    message: z.string().max(10_000).optional(),
  })
  .nullish();

/** Why the window turns idle auto-resume on or off. Only used for logs. */
export const idleResumeReasonSchema = z.string().max(200).nullish();

/** Parses an IPC payload. Logs and returns null when it is invalid. */
export function parseIpcPayload<T extends z.ZodTypeAny>(
  channel: string,
  schema: T,
  payload: unknown,
): z.infer<T> | null {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  log.warn(
    `[ipc] rejected invalid payload on ${channel}:`,
    result.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; "),
  );
  return null;
}

/** Turns null into undefined so optional string fields match the service types. */
export function nullToUndefined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== null) out[key] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], null> };
}
