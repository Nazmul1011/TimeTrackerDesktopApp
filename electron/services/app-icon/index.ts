/**
 * Resolve OS application icons for Top Apps chips.
 *
 * macOS: extract real icons from .app/.icns via `sips` (Electron
 * app.getFileIcon often returns the generic template icon).
 * Windows: app.getFileIcon on the exe path.
 *
 * Returns data:image/png;base64,... so the Next.js renderer can show
 * them without a custom protocol.
 */
import { app } from "electron";
import { execFile, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { promisify } from "util";
import log from "electron-log/main";

const execFileAsync = promisify(execFile);
const SIZE = 64;
const CACHE_VERSION = "v2";

const NAME_ALIASES: Record<string, string[]> = {
  chrome: ["Google Chrome", "Chrome", "Chromium"],
  edge: ["Microsoft Edge", "Edge"],
  "vs code": ["Visual Studio Code", "Code"],
  code: ["Visual Studio Code", "Code"],
  terminal: ["Terminal", "iTerm", "iTerm2", "Warp"],
  files: ["Finder", "Files"],
  docker: ["Docker", "Docker Desktop"],
  cursor: ["Cursor"],
  slack: ["Slack"],
  notion: ["Notion"],
  figma: ["Figma"],
  spotify: ["Spotify"],
  zoom: ["zoom.us", "Zoom"],
  whatsapp: ["WhatsApp"],
  electron: ["Electron"],
  "system settings": ["System Settings", "System Preferences"],
  "user notification center": ["Notification Center"],
  usernotificationcenter: ["Notification Center"],
};

const ICON_RESOLVE_CONCURRENCY = 6;

/** No-op kept for main bootstrap compatibility. */
export function registerAppIconScheme(): void {
  // icons are returned as data URLs — no custom protocol needed
}

export class AppIconService {
  private static instance: AppIconService | null = null;
  private cache = new Map<string, string | null>();
  private inflight = new Map<string, Promise<string | null>>();
  private dir: string;

  private constructor() {
    this.dir = path.join(app.getPath("userData"), "app-icons");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  static getInstance(): AppIconService {
    if (!AppIconService.instance) {
      AppIconService.instance = new AppIconService();
    }
    return AppIconService.instance;
  }

  /** Kept for main bootstrap compatibility. */
  bindProtocol(): void {
    log.info("[AppIconService] using data-URL icons (sips/icns on macOS)");
  }

  async getIconDataUrl(appName: string): Promise<string | null> {
    const key = this.cacheKey(appName);
    if (!key) return null;

    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const job = this.resolveIcon(appName)
      .then((url) => {
        this.cache.set(key, url);
        this.inflight.delete(key);
        return url;
      })
      .catch((error) => {
        log.debug(`[AppIconService] icon resolve failed for ${appName}`, error);
        this.cache.set(key, null);
        this.inflight.delete(key);
        return null;
      });

    this.inflight.set(key, job);
    return job;
  }

  async getIconsDataUrl(appNames: string[]): Promise<Record<string, string | null>> {
    const unique = Array.from(new Set(appNames.map((n) => n.trim()).filter(Boolean)));

    // Each uncached miss spawns mdfind/sips child processes, so resolve in
    // bounded waves rather than one Promise.all over the whole list.
    const out: Record<string, string | null> = {};
    for (let i = 0; i < unique.length; i += ICON_RESOLVE_CONCURRENCY) {
      const wave = unique.slice(i, i + ICON_RESOLVE_CONCURRENCY);
      const entries = await Promise.all(
        wave.map(async (name) => [name, await this.getIconDataUrl(name)] as const),
      );
      for (const [name, url] of entries) out[name] = url;
    }
    return out;
  }

  async rememberFromBundlePath(
    appName: string,
    bundleOrExePath: string | null | undefined,
  ): Promise<string | null> {
    const key = this.cacheKey(appName);
    if (!key) return null;
    if (this.cache.has(key) && this.cache.get(key)) {
      return this.cache.get(key) ?? null;
    }
    if (!bundleOrExePath) return this.getIconDataUrl(appName);

    try {
      const url = await this.iconFromPath(appName, bundleOrExePath);
      this.cache.set(key, url);
      return url;
    } catch {
      return this.getIconDataUrl(appName);
    }
  }

  private cacheKey(appName: string): string {
    return appName.trim().toLowerCase();
  }

  private filePathFor(appName: string): string {
    const hash = createHash("sha1")
      .update(`${CACHE_VERSION}:${this.cacheKey(appName)}`)
      .digest("hex");
    return path.join(this.dir, `${hash}.png`);
  }

  private async resolveIcon(appName: string): Promise<string | null> {
    const outPath = this.filePathFor(appName);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 800) {
      return this.readAsDataUrl(outPath);
    }

    for (const name of this.candidateNames(appName)) {
      const appPath =
        process.platform === "darwin"
          ? await this.resolveMacAppPath(name)
          : process.platform === "win32"
            ? await this.resolveWindowsExePath(name)
            : null;
      if (!appPath) continue;
      const url = await this.iconFromPath(appName, appPath);
      if (url) return url;
    }
    return null;
  }

  private candidateNames(appName: string): string[] {
    const trimmed = appName.trim();
    const lower = trimmed.toLowerCase();
    const aliases = NAME_ALIASES[lower] ?? [];
    return Array.from(new Set([trimmed, ...aliases]));
  }

  private readAsDataUrl(filePath: string): string | null {
    try {
      const buf = fs.readFileSync(filePath);
      if (buf.length < 100) return null;
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  private async iconFromPath(appName: string, filePath: string): Promise<string | null> {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const outPath = this.filePathFor(appName);

    if (process.platform === "darwin") {
      const icns = this.findMacIcns(filePath);
      if (icns) {
        try {
          await execFileAsync(
            "sips",
            ["-z", String(SIZE), String(SIZE), "-s", "format", "png", icns, "--out", outPath],
            { timeout: 5000 },
          );
          if (fs.existsSync(outPath) && fs.statSync(outPath).size > 800) {
            return this.readAsDataUrl(outPath);
          }
        } catch (error) {
          log.debug("[AppIconService] sips failed", error);
        }
      }
    }

    // Windows / fallback
    try {
      const image = await app.getFileIcon(filePath, { size: "normal" });
      if (image.isEmpty()) return null;
      const png = image.resize({ width: SIZE, height: SIZE }).toPNG();
      if (!png?.length || png.length < 800) return null;
      // Skip generic template icons (identical ~5KB placeholders)
      if (png.length < 2000) return null;
      fs.writeFileSync(outPath, png);
      return `data:image/png;base64,${png.toString("base64")}`;
    } catch (error) {
      log.debug("[AppIconService] getFileIcon failed", error);
      return null;
    }
  }

  private findMacIcns(appBundlePath: string): string | null {
    const resources = path.join(appBundlePath, "Contents", "Resources");
    const infoPlist = path.join(appBundlePath, "Contents", "Info.plist");

    // CFBundleIconFile from Info.plist
    try {
      const stdout = execFileSync("defaults", ["read", infoPlist, "CFBundleIconFile"], {
        encoding: "utf8",
        timeout: 2000,
      });
      let iconFile = stdout.trim();
      if (iconFile && !iconFile.endsWith(".icns")) iconFile += ".icns";
      const candidate = path.join(resources, iconFile);
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }

    const preferred = [
      "AppIcon.icns",
      "app.icns",
      "icon.icns",
      `${path.basename(appBundlePath, ".app")}.icns`,
    ];
    for (const name of preferred) {
      const candidate = path.join(resources, name);
      if (fs.existsSync(candidate)) return candidate;
    }

    // Largest .icns in Resources
    try {
      if (!fs.existsSync(resources)) return null;
      const icnsFiles = fs
        .readdirSync(resources)
        .filter((f) => f.toLowerCase().endsWith(".icns"))
        .map((f) => path.join(resources, f))
        .filter((f) => fs.existsSync(f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      return icnsFiles[0] ?? null;
    } catch {
      return null;
    }
  }

  private async resolveMacAppPath(appName: string): Promise<string | null> {
    const home = app.getPath("home");
    const guesses = [
      `/Applications/${appName}.app`,
      `/System/Applications/${appName}.app`,
      `/Applications/Utilities/${appName}.app`,
      path.join(home, "Applications", `${appName}.app`),
    ];
    for (const guess of guesses) {
      if (fs.existsSync(guess)) return guess;
    }

    try {
      const { stdout } = await execFileAsync(
        "osascript",
        [
          "-l",
          "JavaScript",
          "-e",
          `ObjC.import("AppKit");
var target=${JSON.stringify(appName)}.toLowerCase();
var apps=$.NSWorkspace.sharedWorkspace.runningApplications;
var out="";
for (var i=0;i<apps.count;i++){
  var a=apps.objectAtIndex(i);
  var n=String(ObjC.unwrap(a.localizedName)||"").toLowerCase();
  if(n===target){
    var url=a.bundleURL;
    if(url){ out=String(ObjC.unwrap(url.path)||""); break; }
  }
}
out;`,
        ],
        { timeout: 2500 },
      );
      const p = stdout.trim();
      if (p && fs.existsSync(p)) return p;
    } catch (error) {
      log.debug("[AppIconService] running-app lookup failed", error);
    }

    try {
      const safe = appName.replace(/["\\]/g, "");
      const { stdout } = await execFileAsync(
        "mdfind",
        [
          `kMDItemContentTypeTree == "com.apple.application-bundle" && kMDItemDisplayName == "${safe}"c`,
        ],
        { timeout: 2500 },
      );
      const first = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.endsWith(".app") && fs.existsSync(s));
      if (first) return first;
    } catch (error) {
      log.debug("[AppIconService] mdfind lookup failed", error);
    }

    return null;
  }

  private async resolveWindowsExePath(appName: string): Promise<string | null> {
    try {
      const script = `
$ErrorActionPreference = 'SilentlyContinue'
$name = ${JSON.stringify(appName)}
$p = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and (
    $_.ProcessName -like "*$name*" -or $_.MainWindowTitle -like "*$name*"
  )
} | Select-Object -First 1
if ($p -and $p.Path) { $p.Path }
`;
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { timeout: 4000, windowsHide: true },
      );
      const p = stdout.trim();
      if (p && fs.existsSync(p)) return p;
    } catch (error) {
      log.debug("[AppIconService] Windows exe lookup failed", error);
    }
    return null;
  }
}
