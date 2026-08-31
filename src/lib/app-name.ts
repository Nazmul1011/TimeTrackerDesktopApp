/**
 * Normalize OS-raw window class / process names into stable display labels
 * so Top Apps aggregation is readable (Chrome not google-chrome, etc.).
 */

const RULES: Array<{ match: RegExp; name: string }> = [
  { match: /\b(google-?chrome|chromium|chrome)\b/i, name: "Chrome" },
  { match: /\b(msedge|microsoft.?edge|edge)\b/i, name: "Edge" },
  { match: /\bfirefox\b/i, name: "Firefox" },
  { match: /\bbrave\b/i, name: "Brave" },
  { match: /\bcursor\b/i, name: "Cursor" },
  { match: /\b(code|vscode|visual studio code)\b/i, name: "VS Code" },
  { match: /\b(figma)\b/i, name: "Figma" },
  { match: /\b(slack)\b/i, name: "Slack" },
  { match: /\b(discord)\b/i, name: "Discord" },
  { match: /\b(whatsapp)\b/i, name: "WhatsApp" },
  { match: /\b(telegram)\b/i, name: "Telegram" },
  { match: /\b(spotify)\b/i, name: "Spotify" },
  { match: /\b(zoom|zoom.us)\b/i, name: "Zoom" },
  { match: /\b(teams|microsoft teams)\b/i, name: "Teams" },
  { match: /\b(notion)\b/i, name: "Notion" },
  { match: /\b(postman)\b/i, name: "Postman" },
  { match: /\b(docker)\b/i, name: "Docker" },
  { match: /\b(obsidian)\b/i, name: "Obsidian" },
  { match: /\b(youtube)\b/i, name: "YouTube" },
  {
    match:
      /\b(terminal|gnome-terminal|konsole|alacritty|kitty|iterm|warp|hyper)\b/i,
    name: "Terminal",
  },
  {
    match: /\b(nautilus|dolphin|nemo|files|finder|explorer)\b/i,
    name: "Files",
  },
  { match: /\b(intellij|idea)\b/i, name: "IntelliJ" },
  { match: /\b(webstorm)\b/i, name: "WebStorm" },
  { match: /\b(pycharm)\b/i, name: "PyCharm" },
  { match: /\b(android studio)\b/i, name: "Android Studio" },
];

/** Map known process / WM_CLASS strings to a friendly product name. */
export function normalizeAppName(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Desktop";

  for (const rule of RULES) {
    if (rule.match.test(trimmed)) return rule.name;
  }

  // Strip common Linux package prefixes: org.chromium.Chromium → Chromium
  const dotted = trimmed.includes(".")
    ? (trimmed.split(".").pop() ?? trimmed)
    : trimmed;

  // Title-case single tokens like "slack" → "Slack"
  if (/^[a-z0-9_-]+$/i.test(dotted) && dotted.length <= 32) {
    return dotted.charAt(0).toUpperCase() + dotted.slice(1).toLowerCase();
  }

  return dotted || "Desktop";
}

/** Optional icon path for desktop summary chips. */
export function iconForAppName(name: string): string | null {
  const key = name.toLowerCase();
  if (key.includes("figma")) return "/figma/icon-figma.svg";
  if (key.includes("chrome")) return "/figma/icon-chrome.svg";
  if (key.includes("vs code") || key === "code") return "/figma/icon-project.svg";
  if (key.includes("whatsapp")) return "/figma/icon-bell.svg";
  if (key.includes("youtube")) return "/figma/icon-play.svg";
  if (key.includes("discord")) return "/figma/icon-dot.svg";
  return null;
}
