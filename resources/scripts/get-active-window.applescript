#!/usr/bin/osascript
-- Fallback AppleScript for frontmost app (System Events).
-- Prefer get-active-window.jxa which uses NSWorkspace for the app name.
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set winTitle to ""
  try
    set winTitle to name of front window of frontApp
  end try
end tell
set AppleScript's text item delimiters to (ASCII character 30)
return appName & (ASCII character 30) & winTitle
