# Gr8r Time Tracker — Desktop Client

Electron + Next.js desktop app for time tracking, activity monitoring, and employee self-service.

Part of the Gr8r monorepo alongside `TimeTrackerBackend` (API, ~3001) and `TimeTrackerFrontendGr8r` (web dashboard, ~3002).

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron |
| UI | Next.js (App Router), React, TypeScript |
| Styling | TailwindCSS, shadcn/ui |
| State | Zustand |
| API | Axios → NestJS backend |
| Local DB | better-sqlite3 (optional, Electron main process) |
| Packaging | electron-builder, electron-updater |

## Getting Started

### Prerequisites

- Node.js 20+
- Backend running at `http://localhost:3001` (see `TimeTrackerBackend`)

### Run the desktop app

```bash
cd TimeTrackerDesktopApp
cp .env.example .env   # set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev
```

This starts Next.js and opens the **Electron window** (~446×640). Activity tracking and screenshots only work inside Electron — not in a plain browser tab.

**Seed login:** `admin@gr8r.studio` / `Password123!`

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` / `npm start` | Desktop app — Next.js + Electron |
| `npm run dev:web` | Renderer only (browser debugging) |
| `npm run electron:dev` | Same as `dev` |
| `npm run build` | Build Next.js renderer |
| `npm run electron:build` | Package desktop installers |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (renderer + Electron) |

## Architecture

```
TimeTrackerDesktopApp/
├── electron/     # Main process, preload, IPC, native services
├── src/          # Next.js App Router renderer
├── public/       # Static assets
└── resources/    # Icons and packaging assets
```

### Features (implemented)

- **Timer** — start/stop/pause/resume, sync with backend on focus and org switch
- **Activity tracking** — app/window usage, idle detection (Electron only)
- **Screenshots** — periodic capture, delete-request workflow with admin review
- **Timesheet** — today's entries with edit (description/project) and delete
- **Summary** — live top apps and daily stats from backend
- **Profile** — edit name, phone, timezone via `PATCH /users/me`
- **Settings** — notifications, launch on login, screenshot interval (theme: light only)
- **Notifications** — live inbox, push/idle toggles, deep links to home tabs

### Routes

| Path | Purpose |
| --- | --- |
| `/login` | Authentication |
| `/home` | Timer + Summary / Timesheet / Screenshots tabs |
| `/profile` | View and edit profile |
| `/settings` | Preferences |
| `/notifications` | Inbox + admin screenshot deletion review |

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend API base URL |

## License

Proprietary — Gr8r
