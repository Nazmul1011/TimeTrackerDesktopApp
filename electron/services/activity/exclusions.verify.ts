/**
 * Standalone check for the app exclusion matcher.
 * Run with `npm run verify:app-exclusions`.
 *
 * Runs in plain Node, where the settings store can't load. That also covers
 * the fallback: built-in exclusions must still apply when settings fail.
 */
import assert from "assert";
import { isExcludedActivityPayload, isExcludedApp, matchesExclusion } from "./exclusions";

const cases: Array<[string, Parameters<typeof isExcludedApp>[0], boolean]> = [
  // App name in its usual forms
  ["exact name", { appName: "TeamLogger" }, true],
  ["lower case", { appName: "teamlogger" }, true],
  ["spaced", { appName: "Team Logger" }, true],
  ["dashed WM_CLASS", { appName: "team-logger" }, true],
  ["Windows exe name", { appName: "TeamLogger.exe" }, true],
  // Window renamed, but the process is still TeamLogger
  [
    "renamed window, Windows path",
    {
      appName: "Desktop",
      windowTitle: "Status",
      bundlePath: "C:\\Program Files\\TeamLogger\\TeamLogger.exe",
    },
    true,
  ],
  [
    "renamed window, mac bundle",
    {
      appName: "Agent",
      windowTitle: "",
      bundlePath: "/Applications/TeamLogger.app",
    },
    true,
  ],
  [
    "renamed window, Linux exe",
    {
      appName: "electron",
      windowTitle: "Dashboard",
      exePath: "/opt/teamlogger/teamlogger",
    },
    true,
  ],
  ["title only", { appName: "Chrome", windowTitle: "TeamLogger – Login" }, true],
  // Normal apps keep tracking
  ["Chrome", { appName: "Chrome", windowTitle: "GitHub" }, false],
  ["VS Code", { appName: "code", windowTitle: "index.ts — timetracker" }, false],
  ["Teams (prefix overlap)", { appName: "Microsoft Teams" }, false],
  ["Logger app (suffix overlap)", { appName: "Logger Pro" }, false],
  ["empty", { appName: "", windowTitle: "" }, false],
  ["Desktop fallback", { appName: "Desktop", windowTitle: "" }, false],
];

let failed = 0;
for (const [label, info, expected] of cases) {
  const actual = isExcludedApp(info);
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}`);
}

// Activity payloads (renderer → offline outbox → /activity/bulk)
assert.strictEqual(
  isExcludedActivityPayload({ appName: "Teamlogger", duration: 10 }),
  true,
  "payload with excluded appName",
);
assert.strictEqual(
  isExcludedActivityPayload({ appName: "Chrome", windowTitle: "x", duration: 10 }),
  false,
  "normal payload",
);
assert.strictEqual(isExcludedActivityPayload(null), false, "null payload");
console.log("PASS  activity payload checks");

// Extra list entries (the excludedApps setting)
assert.strictEqual(matchesExclusion(["Slack"], ["TeamLogger", "slack"]), true);
assert.strictEqual(matchesExclusion(["Slack"], ["TeamLogger"]), false);
assert.strictEqual(matchesExclusion(["ab"], ["ab"]), false, "tokens under 3 chars ignored");
console.log("PASS  configurable list checks");

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log("\nAll exclusion checks passed");
