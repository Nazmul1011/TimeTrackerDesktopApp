/**
 * electron-builder writes CFBundleIconFile=icon.icns but leaves Electron's
 * electron.icns in the bundle. Dock/Icon Services often still show the atom.
 * Unsigned/linker-signed binaries keep Identifier=Electron, so Dock shows
 * a blank tile or generic cube even when icon.icns is present.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const product = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${product}.app`);
  const resources = path.join(appPath, "Contents", "Resources");
  const brand =
    [
      path.join(resources, "icon.icns"),
      path.join(resources, "resources", "icons", "icon.icns"),
    ].find((candidate) => fs.existsSync(candidate)) || null;
  if (brand) {
    fs.copyFileSync(brand, path.join(resources, "electron.icns"));
    if (brand !== path.join(resources, "icon.icns")) {
      fs.copyFileSync(brand, path.join(resources, "icon.icns"));
    }
  }
  const identity = context.packager.config?.mac?.identity;
  // Developer ID is applied by electron-builder after this hook. Do not
  // overwrite it with an ad-hoc signature.
  if (identity && identity !== "null") {
    return;
  }
  const entitlements = path.join(context.packager.projectDir, "build", "entitlements.mac.plist");
  // Do not --deep: that re-signs Electron Framework and the app will not launch.
  // Outer ad-hoc sign binds Info.plist so Dock uses com.gr8r.timetracker + icon.icns.
  const signArgs = ["--force", "--sign", "-"];
  if (fs.existsSync(entitlements)) {
    signArgs.push("--entitlements", entitlements);
  }
  signArgs.push(appPath);
  execFileSync("codesign", signArgs);
};
