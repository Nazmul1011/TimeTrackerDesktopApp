"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyDockIcon = applyDockIcon;
exports.applyDockIconSoon = applyDockIconSoon;
/**
 * Keep the custom Dock icon applied. `electron:dev` runs stock Electron.app,
 * so macOS reverts to the host/window icon after show, focus, or bounce.
 */
const electron_1 = require("electron");
const main_1 = __importDefault(require("electron-log/main"));
const index_1 = require("./index");
let cached = null;
let followUp = null;
function loadIcon() {
    if (cached && !cached.isEmpty())
        return cached;
    const iconPath = (0, index_1.findExistingPath)((0, index_1.resolveAppIconPaths)());
    if (!iconPath)
        return null;
    const image = electron_1.nativeImage.createFromPath(iconPath);
    if (image.isEmpty())
        return null;
    cached = image;
    return cached;
}
/** Apply the circular brand icon to the Dock. Call at launch / after bounce only — not on every focus. */
function applyDockIcon() {
    if (process.platform !== "darwin" || !electron_1.app.dock)
        return;
    // Packaged .app already has icon.icns / electron.icns. Runtime setIcon()
    // replaces that with a PNG NativeImage; macOS Dock then shows a generic cube.
    if (electron_1.app.isPackaged)
        return;
    try {
        const image = loadIcon();
        if (!image) {
            main_1.default.warn("[dock] icon skipped — no icon file found");
            return;
        }
        electron_1.app.dock.setIcon(image);
    }
    catch (error) {
        main_1.default.warn("[dock] setIcon failed", error);
    }
}
/**
 * Re-apply after Electron/macOS asynchronously replaces the custom icon.
 */
function applyDockIconSoon() {
    applyDockIcon();
    if (followUp)
        clearTimeout(followUp);
    followUp = setTimeout(() => {
        followUp = null;
        applyDockIcon();
    }, 350);
}
//# sourceMappingURL=dock-icon.js.map