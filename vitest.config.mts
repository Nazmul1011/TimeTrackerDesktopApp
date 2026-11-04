import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for renderer logic (src/) and main-process logic (electron/).
 * Run through `npm test`, which uses Electron's Node so native modules
 * (better-sqlite3) load with the same ABI as the real app.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@electron": path.resolve(__dirname, "electron"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    coverage: {
      include: ["src/lib/**", "src/store/**", "electron/database/**", "electron/services/**"],
    },
  },
});
