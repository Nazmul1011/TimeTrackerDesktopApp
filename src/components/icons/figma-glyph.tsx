/**
 * Figma glyph rendered via CSS background so Electron reliably paints SVG fills.
 */
export function FigmaGlyph({
  src,
  size = 16,
}: {
  src: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
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
