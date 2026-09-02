/**
 * Desktop preference settings — persisted in electron-store.
 */
import { app } from "electron";
import log from "electron-log/main";
import { StorageService } from "../storage";

export type DesktopSettings = {
  theme: "light" | "dark" | "system";
  screenshotIntervalMinutes: number;
  idleTimeoutMinutes: number;
  autoStartOnLogin: boolean;
  notificationsEnabled: boolean;
};

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  theme: "light",
  screenshotIntervalMinutes: 5,
  idleTimeoutMinutes: 3,
  autoStartOnLogin: false,
  notificationsEnabled: true,
};

function isTheme(v: unknown): v is DesktopSettings["theme"] {
  return v === "light" || v === "dark" || v === "system";
}

export function normalizeDesktopSettings(
  raw: Record<string, unknown> | null | undefined,
): DesktopSettings {
  const merged = { ...DEFAULT_DESKTOP_SETTINGS, ...(raw ?? {}) };
  return {
    theme: isTheme(merged.theme) ? merged.theme : DEFAULT_DESKTOP_SETTINGS.theme,
    screenshotIntervalMinutes:
      typeof merged.screenshotIntervalMinutes === "number" &&
      merged.screenshotIntervalMinutes > 0
        ? merged.screenshotIntervalMinutes
        : DEFAULT_DESKTOP_SETTINGS.screenshotIntervalMinutes,
    idleTimeoutMinutes:
      typeof merged.idleTimeoutMinutes === "number" &&
      merged.idleTimeoutMinutes >= 0
        ? merged.idleTimeoutMinutes
        : DEFAULT_DESKTOP_SETTINGS.idleTimeoutMinutes,
    autoStartOnLogin: Boolean(merged.autoStartOnLogin),
    notificationsEnabled: merged.notificationsEnabled !== false,
  };
}

export class SettingsService {
  private static instance: SettingsService | null = null;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  get(): DesktopSettings {
    return normalizeDesktopSettings(
      this.storage().getSettings() as Record<string, unknown>,
    );
  }

  set(partial: Partial<DesktopSettings>): {
    ok: boolean;
    settings: DesktopSettings;
    message?: string;
  } {
    const current = this.get();
    const next = normalizeDesktopSettings({
      ...current,
      ...partial,
    } as unknown as Record<string, unknown>);

    if (
      typeof partial.autoStartOnLogin === "boolean" &&
      partial.autoStartOnLogin !== current.autoStartOnLogin
    ) {
      const applied = this.applyLoginItem(partial.autoStartOnLogin);
      if (!applied.ok) {
        return {
          ok: false,
          settings: current,
          message: applied.message,
        };
      }
      // Trust the requested value — getLoginItemSettings is unreliable on some Linux setups.
      next.autoStartOnLogin = partial.autoStartOnLogin;
    }

    this.storage().setSettings(next as unknown as Record<string, unknown>);
    log.info("[SettingsService] saved", next);
    return { ok: true, settings: next };
  }

  /** Restore login item from disk on app boot. */
  applyStoredLoginItem(): void {
    const settings = normalizeDesktopSettings(
      this.storage().getSettings() as Record<string, unknown>,
    );
    this.applyLoginItem(settings.autoStartOnLogin);
  }

  notificationsEnabled(): boolean {
    return this.get().notificationsEnabled;
  }

  private applyLoginItem(openAtLogin: boolean): {
    ok: boolean;
    openAtLogin: boolean;
    message?: string;
  } {
    try {
      app.setLoginItemSettings({
        openAtLogin,
        openAsHidden: false,
      });
      const actual = app.getLoginItemSettings();
      log.info("[SettingsService] login item", actual);
      return { ok: true, openAtLogin: Boolean(actual.openAtLogin) };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not update launch on login";
      log.warn("[SettingsService] setLoginItemSettings failed", error);
      return { ok: false, openAtLogin: false, message };
    }
  }

  private storage(): StorageService {
    return StorageService.getInstance();
  }
}
