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
const CACHE_VERSION = "v3";

/** Windows shell hosts whose getFileIcon is a generic window, not a brand logo. */
const GENERIC_EXE_BASENAMES = new Set([
  "explorer.exe",
  "applicationframehost.exe",
  "searchhost.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "runtimebroker.exe",
  "dllhost.exe",
  "rundll32.exe",
  "openwith.exe",
  "systemsettings.exe",
  "textinputhost.exe",
]);

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
    log.info("[AppIconService] using data-URL icons (sips on macOS, getFileIcon on Windows)");
  }

  async getIconDataUrl(appName: string): Promise<string | null> {
    const key = this.cacheKey(appName);
    if (!key) return null;
    if (this.shouldUseLetterIcon(appName)) {
      this.cache.set(key, null);
      return null;
    }

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
    if (this.shouldUseLetterIcon(appName)) {
      this.cache.set(key, null);
      return null;
    }
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

  private shouldUseLetterIcon(appName: string): boolean {
    const key = appName.trim().toLowerCase();
    return (
      key === "files" ||
      key === "explorer" ||
      key === "file explorer" ||
      key === "windows explorer" ||
      key.includes("file explorer")
    );
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
      if (this.isGenericExePath(filePath)) return null;

      const image = await app.getFileIcon(filePath, { size: "normal" });
      if (image.isEmpty()) return null;
      const png = image.resize({ width: SIZE, height: SIZE }).toPNG();
      if (!png?.length || png.length < 800) return null;
      if (png.length < 2000) return null;
      if (this.isGenericShellIcon(image.resize({ width: SIZE, height: SIZE }))) {
        return null;
      }
      fs.writeFileSync(outPath, png);
      return `data:image/png;base64,${png.toString("base64")}`;
    } catch (error) {
      log.debug("[AppIconService] getFileIcon failed", error);
      return null;
    }
  }

  private isGenericExePath(filePath: string): boolean {
    return GENERIC_EXE_BASENAMES.has(path.basename(filePath).toLowerCase());
  }

  /**
   * Windows getFileIcon often returns a gray window / filmstrip glyph for
   * Explorer and other shell hosts. Skip those so the UI can show a letter.
   * Keep high-contrast 2-tone glyphs (Terminal).
   */
  private isGenericShellIcon(image: Electron.NativeImage): boolean {
    try {
      const bmp = image.toBitmap();
      const { width, height } = image.getSize();
      if (!bmp?.length || width < 8 || height < 8) return true;

      const colors = new Set<string>();
      let lumaSum = 0;
      let opaque = 0;
      let minL = 255;
      let maxL = 0;

      for (let i = 0; i + 3 < bmp.length; i += 16) {
        const a = bmp[i + 3];
        if (a < 40) continue;
        const b = bmp[i];
        const g = bmp[i + 1];
        const r = bmp[i + 2];
        const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        lumaSum += luma;
        opaque += 1;
        minL = Math.min(minL, luma);
        maxL = Math.max(maxL, luma);
        colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
        if (colors.size > 22) return false;
      }

      if (opaque < 8) return true;
      const meanLuma = lumaSum / opaque;
      const contrast = maxL - minL;
      if (colors.size <= 4 && contrast >= 140) return false;
      return colors.size <= 12 && meanLuma >= 130 && meanLuma <= 230;
    } catch {
      return false;
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
$hit = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  $desc = ''
  $exe = ''
  try { $desc = $_.MainModule.FileVersionInfo.FileDescription } catch {}
  try { $exe = $_.MainModule.FileName } catch {}
  if (-not $exe) { try { $exe = $_.Path } catch {} }
  [PSCustomObject]@{
    Desc = [string]$desc
    Name = [string]$_.ProcessName
    Title = [string]$_.MainWindowTitle
    Exe = [string]$exe
  }
} | Where-Object {
  $_.Exe -and (
    $_.Desc -like "*$name*" -or $_.Name -like "*$name*" -or $_.Title -like "*$name*"
  )
} | Select-Object -First 1
if ($hit) { $hit.Exe }
`;
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { timeout: 4000, windowsHide: true },
      );
      const p =
        stdout
          .trim()
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find(Boolean) ?? "";
      if (p && fs.existsSync(p)) return p;
    } catch (error) {
      log.debug("[AppIconService] Windows exe lookup failed", error);
    }
    return null;
  }
}
