/**
 * electron-builder afterPack: one hook per platform.
 */
const mac = require("./after-pack-mac-icon.cjs");
const linux = require("./after-pack-linux-launcher.cjs");

exports.default = async function afterPack(context) {
  await mac.default(context);
  await linux.default(context);
};
