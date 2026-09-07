/**
 * Serves the Next.js static export (`out/`) for packaged Electron builds.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { app } from "electron";
import log from "electron-log/main";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

let server: http.Server | null = null;
let rendererOrigin: string | null = null;

function getStaticRoot(): string {
  // Packaged: files live next to package.json inside app.asar / app folder
  // Dev fallback (unused when not packaged): project root `out/`
  return app.isPackaged
    ? path.join(app.getAppPath(), "out")
    : path.join(app.getAppPath(), "out");
}

function resolveFile(root: string, urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split("?")[0] || "/").replace(/\\/g, "/");
  const candidates: string[] = [];

  if (clean === "/" || clean === "") {
    candidates.push(path.join(root, "index.html"));
  } else {
    const noSlash = clean.replace(/\/+$/, "");
    candidates.push(path.join(root, noSlash));
    candidates.push(path.join(root, `${noSlash}.html`));
    candidates.push(path.join(root, noSlash, "index.html"));
  }

  for (const file of candidates) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function startRendererServer(): Promise<string> {
  if (rendererOrigin) return rendererOrigin;

  const root = getStaticRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`Static renderer not found at ${root}. Run next build with output: 'export'.`);
  }

  server = http.createServer((req, res) => {
    const urlPath = req.url || "/";
    const file = resolveFile(root, urlPath);
    if (!file) {
      // SPA-style fallback to index for client navigations that miss a file
      const fallback = path.join(root, "index.html");
      if (fs.existsSync(fallback)) {
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        fs.createReadStream(fallback).pipe(res);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    // Bind localhost only — renderer is local to this machine
    server!.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind renderer server");
  }

  rendererOrigin = `http://127.0.0.1:${address.port}`;
  process.env.ELECTRON_RENDERER_URL = rendererOrigin;
  log.info(`[renderer-server] Serving ${root} at ${rendererOrigin}`);
  return rendererOrigin;
}

export function getRendererOrigin(): string | null {
  return rendererOrigin;
}

export function stopRendererServer(): void {
  if (!server) return;
  server.close();
  server = null;
  rendererOrigin = null;
}
