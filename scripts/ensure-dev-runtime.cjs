/**
 * Build a dedicated macOS .app for `electron:dev`.
 * Stock Electron.app keeps the atom in Dock/Icon Services; a new bundle id
 * and name makes the circular Gr8r icon the real app icon.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin") process.exit(0);

const root = path.join(__dirname, "..");
const iconSrc = path.join(root, "resources", "icons", "icon.icns");
const electronApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const runtimeDir = path.join(root, ".dev-runtime");
const destApp = path.join(runtimeDir, "Gr8r Time Tracker.app");
const stampPath = path.join(runtimeDir, ".stamp");
const displayName = "Gr8r Time Tracker";
const bundleId = "com.gr8r.timetracker.dev";

if (!fs.existsSync(iconSrc) || !fs.existsSync(electronApp)) {
  console.warn("[dev-runtime] skipped — icon or Electron.app missing");
  process.exit(0);
}

function plistString(plist, key) {
  try {
    return execFileSync("plutil", ["-extract", key, "raw", plist], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const electronVersion = plistString(
  path.join(electronApp, "Contents", "Info.plist"),
  "CFBundleVersion",
);
const stamp = `${electronVersion}:${fs.statSync(iconSrc).mtimeMs}:${bundleId}`;
const destPlist = path.join(destApp, "Contents", "Info.plist");
const destIcon = path.join(destApp, "Contents", "Resources", "electron.icns");
const already =
  fs.existsSync(stampPath) &&
  fs.readFileSync(stampPath, "utf8") === stamp &&
  fs.existsSync(destIcon) &&
  plistString(destPlist, "CFBundleIdentifier") === bundleId;

if (already) process.exit(0);

fs.mkdirSync(runtimeDir, { recursive: true });
if (fs.existsSync(destApp)) {
  fs.rmSync(destApp, { recursive: true, force: true });
}

execFileSync("ditto", [electronApp, destApp]);
fs.copyFileSync(iconSrc, destIcon);
execFileSync("plutil", ["-replace", "CFBundleDisplayName", "-string", displayName, destPlist]);
execFileSync("plutil", ["-replace", "CFBundleName", "-string", displayName, destPlist]);
execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", bundleId, destPlist]);
execFileSync("codesign", ["--force", "--sign", "-", destApp]);

try {
  const lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  if (fs.existsSync(lsregister)) {
    execFileSync(lsregister, ["-f", destApp]);
  }
} catch {
  // Dock will pick the new bundle up on next launch.
}

fs.writeFileSync(stampPath, stamp);
console.log("[dev-runtime] Gr8r Time Tracker.app ready");
