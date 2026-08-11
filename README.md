# Gr8r Time Tracker — Desktop Client

Enterprise-ready Electron + Next.js desktop application for time tracking and HRM.

> This repository contains **only** the desktop client. Backend APIs and the web dashboard live elsewhere.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron |
| UI | Next.js (App Router), React, TypeScript |
| Styling | TailwindCSS, shadcn/ui |
| State | Zustand, TanStack Query |
| Forms | React Hook Form, Zod |
| Local DB | better-sqlite3 |
| Packaging | electron-builder, electron-updater |

## Getting Started

```bash
cd desktop
cp .env.example .env
npm install
npm run electron:dev
```

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Next.js renderer only |
| `npm run electron:dev` | Next.js + Electron together |
| `npm run electron` | Launch Electron against built main process |
| `npm run build` | Build Next.js renderer |
| `npm run electron:build` | Package desktop installers |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | TypeScript checks (renderer + Electron) |

## Architecture

```
desktop/
├── electron/     # Main process, preload, IPC, native services, SQLite
├── src/          # Next.js App Router renderer (UI)
├── public/       # Static assets served by Next.js
└── resources/    # Icons, tray assets, fonts for packaging
```

### Electron (`electron/`)

- **main/** — Window lifecycle, tray, menu, updater, security hardening
- **preload/** — Context-isolated bridge exposing a typed `window.electronAPI`
- **ipc/** — Empty IPC channel handlers (auth, timer, screenshots, etc.)
- **services/** — Native service stubs (activity, idle, sync, storage…)
- **database/** — better-sqlite3 initialization (no schema yet)

### Renderer (`src/`)

- **app/** — Routes: `/` → `/home`, login, profile, settings, notifications
- **components/** — Layout, timer, summary, timesheet, screenshots, UI primitives
- **features/** — Feature-based modules (empty shells ready for business logic)
- **store/** — Zustand stores
- **providers/** — Query, theme, toast, tooltip, dialog
- **services/** — Axios API client + Electron bridge helpers

## Status

This is an **architecture-only** initialization.

- No timer / activity / screenshot business logic
- No backend integration beyond Axios stubs
- Home page layout + empty feature modules only

### Local SQLite (`better-sqlite3`)

`better-sqlite3` is listed under `optionalDependencies` because it needs a native build that may fail on newer Node versions during `npm install`. The Electron main process loads it dynamically and continues if unavailable.

To enable SQLite later:

```bash
npm install better-sqlite3
npx electron-rebuild -f -w better-sqlite3
```

## License

Proprietary — Gr8r
