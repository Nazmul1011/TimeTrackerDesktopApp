/**
 * Wrap the Linux binary in a launcher that passes --no-sandbox.
 *
 * Ubuntu 24+ blocks the user namespaces Chromium's sandbox needs, and an
 * AppImage has no setuid chrome-sandbox or AppArmor profile to fall back on,
 * so every renderer dies and the window stays blank. The zygote reads the
 * flag before main.js runs, so app.commandLine.appendSwitch is too late.
 */
const fs = require("fs");
const path = require("path");

exports.default = async function afterPackLinuxLauncher(context) {
  if (context.electronPlatformName !== "linux") return;
  const name = context.packager.executableName;
  const binary = path.join(context.appOutDir, name);
  const real = `${binary}.bin`;
  if (fs.existsSync(real)) return;
  fs.renameSync(binary, real);
  fs.writeFileSync(
    binary,
    `#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/${name}.bin" --no-sandbox "$@"\n`,
    { mode: 0o755 },
  );
};
