/**
 * Figma glyph rendered via CSS background so Electron reliably paints SVG fills.
 */

/** Glyphs drawn in dark ink; they are flipped to light ink in dark mode. */
const DARK_INK_GLYPHS = new Set([
  "/figma/icon-add.svg",
  "/figma/icon-bell.svg",
  "/figma/icon-bell-unread.svg",
  "/figma/icon-chevron-16.svg",
  "/figma/icon-more.svg",
  "/figma/icon-notif-leave.svg",
  "/figma/icon-notif-screenshot.svg",
  "/figma/icon-pause.svg",
  "/figma/icon-project-inbox.svg",
]);

/** `invert` alone tints grey ink warm; the hue turn brings it back to cool grey. */
export const DARK_INK_INVERT = "dark:invert dark:hue-rotate-180";

export function isDarkInkGlyph(src: string): boolean {
  return DARK_INK_GLYPHS.has(src);
}

export function FigmaGlyph({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${isDarkInkGlyph(src) ? DARK_INK_INVERT : ""}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
      }}
    />
  );
}
