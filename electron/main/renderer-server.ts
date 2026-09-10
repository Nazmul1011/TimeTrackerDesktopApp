/**
 * Serves the static Next export (`out/`) on 127.0.0.1 so a packaged
 * .dmg does not depend on localhost:3000 from `next dev`.
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
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".map": "application/json",
};

function getOutDir(): string {
  return path.join(app.getAppPath(), "out");
}

function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const rel = decoded.replace(/^\/+/, "") || "index.html";
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function fileCandidates(root: string, urlPath: string): string[] {
  const base = safeJoin(root, urlPath);
  if (!base) return [];
  const withoutSlash = base.replace(/\/+$/, "");
  return [
    base,
    `${withoutSlash}.html`,
    path.join(withoutSlash, "index.html"),
    path.join(root, "index.html"),
  ];
}

export function startRendererServer(): Promise<{ port: number; close: () => void }> {
  const root = getOutDir();
  if (!fs.existsSync(root)) {
    return Promise.reject(new Error(`Packaged UI missing: ${root}`));
  }

  const server = http.createServer((req, res) => {
    const urlPath = req.url || "/";
    const candidates = fileCandidates(root, urlPath);
    const file = candidates.find((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });

    if (!file) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    // next/font preloads with crossorigin=""; Chromium requires ACAO even on 127.0.0.1
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (ext === ".woff" || ext === ".woff2") {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Fixed port so Chromium localStorage (login session) survives quit.
    // listen(0) picked a new port every launch → empty login every time.
    const port = Number(process.env.ELECTRON_RENDERER_PORT) || 47831;
    server.listen(port, "127.0.0.1", () => {
      log.info(`[renderer-server] Serving ${root} on http://127.0.0.1:${port}`);
      resolve({
        port,
        close: () => server.close(),
      });
    });
  });
}
