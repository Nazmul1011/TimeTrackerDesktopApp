/**
 * Run Vitest inside Electron's Node runtime.
 * better-sqlite3 is built for Electron, so plain `node` cannot load it.
 * Extra args pass through, e.g. `npm test -- tests/electron/outbox.test.ts`.
 */
const { spawn } = require("child_process");
const path = require("path");

const electronBinary = require("electron");
const vitestEntry = path.join(__dirname, "..", "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);

const child = spawn(electronBinary, [vitestEntry, ...(args.length ? args : ["run"])], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  cwd: path.join(__dirname, ".."),
});

child.on("exit", (code) => process.exit(code ?? 1));
