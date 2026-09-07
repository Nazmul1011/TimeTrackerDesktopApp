/**
 * Launch Electron. On macOS use the dedicated Gr8r .app so Dock never
 * shows the stock Electron atom.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let binary = require("electron");
if (process.platform === "darwin") {
  const branded = path.join(
    root,
    ".dev-runtime",
    "Gr8r Time Tracker.app",
    "Contents",
    "MacOS",
    "Electron",
  );
  if (fs.existsSync(branded)) binary = branded;
}

const child = spawn(binary, [root, "--no-sandbox"], {
  stdio: "inherit",
  env,
  cwd: root,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
