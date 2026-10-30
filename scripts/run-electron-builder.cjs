/**
 * Run electron-builder without ELECTRON_RUN_AS_NODE.
 * `env -u` is Unix-only; npm on Windows sets that variable.
 */
const { spawn } = require("child_process");
const path = require("path");

delete process.env.ELECTRON_RUN_AS_NODE;

const isWin = process.platform === "win32";
const bin = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  isWin ? "electron-builder.cmd" : "electron-builder",
);

const child = spawn(bin, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  cwd: path.join(__dirname, ".."),
  shell: isWin,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
