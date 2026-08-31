/**
 * Listen for real keyboard / mouse-button events on X11 via `xinput test-xi2`.
 * Ignores auto-repeat and synthetic/hotkey devices so a stuck media key cannot
 * look like 100% activity.
 */
import { spawn, execFile, type ChildProcess } from "child_process";
import log from "electron-log/main";

const JUNK_DEVICE =
  /XTEST|Video Bus|Power Button|Sleep Button|Intel HID|Intel Virtual|Wireless hotkeys|HP WMI|Stylus/i;

/** XF86WakeUp / media / brightness / power — often spam or "stuck". */
const IGNORED_KEYCODES = new Set([
  121, 122, 123, 124, 150, 151, 160, 161, 166, 167, 171, 172, 173, 174, 179,
  232, 233, 235, 237, 238, 246,
]);

type ParsedEvent = {
  name: string;
  device: number;
  detail: number;
  flags: string;
};

export class LinuxXInputListener {
  private proc: ChildProcess | null = null;
  private stdoutBuf = "";
  private current: ParsedEvent | null = null;
  private junkDevices = new Set<number>();
  private onInput: ((kind: "keyboard" | "mouse") => void) | null = null;
  private startId = 0;

  async start(onInput: (kind: "keyboard" | "mouse") => void): Promise<boolean> {
    this.killProcess();
    const id = ++this.startId;
    this.onInput = onInput;
    this.junkDevices = await loadJunkDeviceIds();
    if (id !== this.startId) return false;

    try {
      this.proc = spawn("xinput", ["test-xi2", "--root"], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      log.warn("[IdleService] xinput spawn failed", error);
      this.onInput = null;
      return false;
    }

    const proc = this.proc;
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
    proc.stderr?.on("data", (chunk: string) => {
      const text = chunk.trim();
      if (text) log.warn(`[IdleService] xinput: ${text.slice(0, 200)}`);
    });
    proc.on("error", (error) => {
      log.warn("[IdleService] xinput process error", error);
    });
    proc.on("exit", (code, signal) => {
      if (this.proc !== proc) return;
      if (code || signal) {
        log.warn(
          `[IdleService] xinput exited code=${code} signal=${signal ?? ""}`,
        );
      }
      this.proc = null;
    });

    log.info("[IdleService] xinput keyboard/click listener started");
    return true;
  }

  stop() {
    this.startId += 1;
    this.onInput = null;
    this.killProcess();
  }

  private killProcess() {
    this.flushEvent();
    this.stdoutBuf = "";
    this.current = null;
    const proc = this.proc;
    this.proc = null;
    if (!proc) return;
    proc.stdout?.removeAllListeners();
    proc.stderr?.removeAllListeners();
    proc.removeAllListeners();
    try {
      proc.kill("SIGTERM");
    } catch {
      // already gone
    }
  }

  private onStdout(chunk: string) {
    this.stdoutBuf += chunk;
    const lines = this.stdoutBuf.split("\n");
    this.stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      this.onLine(line);
    }
  }

  private onLine(line: string) {
    const start = line.match(/^EVENT type \d+ \((\w+)\)/);
    if (start) {
      this.flushEvent();
      this.current = {
        name: start[1],
        device: 0,
        detail: 0,
        flags: "",
      };
      return;
    }
    if (!this.current) return;

    const device = line.match(/^\s+device:\s+(\d+)/);
    if (device) {
      this.current.device = Number(device[1]);
      return;
    }
    const detail = line.match(/^\s+detail:\s+(\d+)/);
    if (detail) {
      this.current.detail = Number(detail[1]);
      return;
    }
    const flags = line.match(/^\s+flags:\s*(.*)$/);
    if (flags) {
      this.current.flags = flags[1].trim();
    }
  }

  private flushEvent() {
    const event = this.current;
    this.current = null;
    if (!event || !this.onInput) return;
    if (this.junkDevices.has(event.device)) return;

    if (event.name === "KeyPress") {
      if (/\brepeat\b/i.test(event.flags)) return;
      if (IGNORED_KEYCODES.has(event.detail)) return;
      this.onInput("keyboard");
      return;
    }

    if (event.name === "ButtonPress") {
      this.onInput("mouse");
    }
  }
}

function loadJunkDeviceIds(): Promise<Set<number>> {
  return new Promise((resolve) => {
    execFile("xinput", ["list", "--short"], { timeout: 3000 }, (error, stdout) => {
      const junk = new Set<number>();
      if (error || !stdout) {
        resolve(junk);
        return;
      }
      for (const line of stdout.split("\n")) {
        const idMatch = line.match(/id=(\d+)/);
        if (!idMatch) continue;
        const name = line
          .slice(0, line.indexOf("id="))
          .replace(/[^\w\s:().+/-]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (JUNK_DEVICE.test(name)) {
          junk.add(Number(idMatch[1]));
        }
      }
      resolve(junk);
    });
  });
}
