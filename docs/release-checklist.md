# Desktop release checklist

Run before every release and after any change to the timer, tracking, auth, offline, or tray code.
Test in the real Electron app (`npm run dev` or an installed build), not `dev:web`.
Backend must be running. Mark each line ✅ / ❌ and note the OS (Windows / macOS).

## 0. Automated checks

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes

## 1. Login and session

- [ ] Log in with email + password
- [ ] Workspace picker shows when the user has more than one organization
- [ ] Switch workspace → timesheet, screenshots, summary reload for the new org
- [ ] Quit and reopen → still logged in, same workspace
- [ ] Turn Wi-Fi off, reopen app → still logged in (not kicked to login)
- [ ] Log out → back to login, tracking stops

## 2. Timer

- [ ] Start → clock starts at once, tray shows running
- [ ] Pause → clock stops; Resume → continues from the same time
- [ ] Stop → entry appears in Timesheet, today's total updated
- [ ] Click start/pause/resume quickly several times → final state is correct, no duplicate entries
- [ ] Change project while running
- [ ] Start timer on the web dashboard → desktop picks it up on window focus

## 3. Tracking (timer running)

- [ ] First screenshot arrives a few seconds after start, then at the admin interval
- [ ] Screenshots tab shows them; delete request works
- [ ] Summary shows top apps and activity %
- [ ] Hide window (X) for 2+ minutes while working → screenshots and heartbeat continue, timer not auto-stopped by the server

## 4. Idle (timeout is 2 minutes)

- [ ] Leave mouse and keyboard for 2 minutes → timer auto-pauses, OS notification shown
- [ ] Move mouse → timer auto-resumes, "Timer started" notification
- [ ] Manual Pause, then move mouse → timer stays paused (needs Resume)

## 5. Offline

- [ ] Wi-Fi off → start / pause / resume / stop still change the clock, "saved on this laptop" message shown
- [ ] Screenshots taken offline appear as saved on this PC
- [ ] Wi-Fi on → queued events upload in order with original times; timesheet matches what happened
- [ ] Kill the app (Task Manager) while running → reopen → session closed at the last saved moment, no hours added for the time it was closed

## 6. Window, tray, quit

- [ ] X / minimize hides to tray, timer keeps running, no "timer stopped" notification
- [ ] Tray menu shows status and can pause/resume/stop
- [ ] Opening the app a second time focuses the existing window
- [ ] Tray Quit while running → timer stopped and saved on the server before exit

## 7. Other screens

- [ ] Profile: edit name / phone / timezone, saved after reload
- [ ] Settings: launch on login, notification toggles persist
- [ ] Notifications: live inbox updates; clicking a card only marks it read

## 8. Packaged build only

- [ ] Installer installs and launches (Windows NSIS / macOS DMG)
- [ ] macOS: Screen Recording and Automation prompts appear and tracking works after granting
- [ ] Auto-update detects a newer version
