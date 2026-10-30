/**
 * Linux app icons for Top Apps chips.
 *
 * There is no OS API for "icon of this app", so match the name against the
 * freedesktop .desktop entries and look their Icon= up in the icon themes.
 */
import fs from "fs";
import os from "os";
import path from "path";

type DesktopEntry = {
  id: string;
  name: string;
  wmClass: string;
  icon: string;
};

const ICON_SIZES = ["256x256", "128x128", "96x96", "72x72", "64x64", "48x48", "scalable"];
const ICON_EXTENSIONS = [".png", ".svg"];

function dataDirs(): string[] {
  const home = os.homedir();
  const system = (process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share")
    .split(":")
    .filter(Boolean);
  return Array.from(
    new Set([
      process.env.XDG_DATA_HOME || path.join(home, ".local", "share"),
      ...system,
      path.join(home, ".local", "share", "flatpak", "exports", "share"),
      "/var/lib/flatpak/exports/share",
      "/var/lib/snapd/desktop",
    ]),
  );
}

function parseDesktopEntry(id: string, raw: string): DesktopEntry | null {
  const start = raw.indexOf("[Desktop Entry]");
  if (start < 0) return null;
  const body = raw.slice(start + "[Desktop Entry]".length).split(/^\[/m)[0];
  const read = (key: string) => body.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  if (/^true$/i.test(read("NoDisplay")) && !read("StartupWMClass")) return null;
  const icon = read("Icon");
  if (!icon) return null;
  return { id, name: read("Name"), wmClass: read("StartupWMClass"), icon };
}

let entries: DesktopEntry[] | null = null;

function loadEntries(): DesktopEntry[] {
  if (entries) return entries;
  const found: DesktopEntry[] = [];
  for (const dir of dataDirs()) {
    const appsDir = path.join(dir, "applications");
    let files: string[];
    try {
      files = fs.readdirSync(appsDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".desktop")) continue;
      try {
        const entry = parseDesktopEntry(
          file.replace(/\.desktop$/, ""),
          fs.readFileSync(path.join(appsDir, file), "utf8"),
        );
        if (entry) found.push(entry);
      } catch {
        // unreadable entry
      }
    }
  }
  entries = found;
  return found;
}

function findEntry(appName: string): DesktopEntry | null {
  const target = appName.trim().toLowerCase();
  if (!target) return null;
  const all = loadEntries();
  const lastSegment = (id: string) => id.split(".").pop() ?? id;
  return (
    all.find((e) => e.wmClass.toLowerCase() === target) ??
    all.find((e) => e.name.toLowerCase() === target) ??
    all.find((e) => e.id.toLowerCase() === target) ??
    all.find((e) => lastSegment(e.id).toLowerCase() === target) ??
    null
  );
}

function findThemeIcon(icon: string): string | null {
  if (path.isAbsolute(icon)) return fs.existsSync(icon) ? icon : null;
  const base = icon.replace(/\.(png|svg|xpm)$/i, "");
  for (const dir of dataDirs()) {
    for (const size of ICON_SIZES) {
      for (const ext of ICON_EXTENSIONS) {
        const candidate = path.join(dir, "icons", "hicolor", size, "apps", `${base}${ext}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    for (const ext of ICON_EXTENSIONS) {
      const candidate = path.join(dir, "pixmaps", `${base}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Icon file for a display name or WM_CLASS, or null when nothing matches. */
export function resolveLinuxIconPath(appName: string): string | null {
  const entry = findEntry(appName);
  return entry ? findThemeIcon(entry.icon) : null;
}
