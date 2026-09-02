/**
 * Windows foreground window helper — called via powershell.exe -File.
 * Prefer FileDescription for app name; fall back to ProcessName.
 */
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Gr8rWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@

$hwnd = [Gr8rWin]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Output ("Desktop" + [char]0x1E)
  exit 0
}

$sb = New-Object System.Text.StringBuilder 1024
[void][Gr8rWin]::GetWindowText($hwnd, $sb, $sb.Capacity)
$pidOut = 0
[void][Gr8rWin]::GetWindowThreadProcessId($hwnd, [ref]$pidOut)

$app = "Desktop"
if ($pidOut -gt 0) {
  $proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
  if ($proc) {
    $desc = $null
    try { $desc = $proc.MainModule.FileVersionInfo.FileDescription } catch {}
    if ([string]::IsNullOrWhiteSpace($desc)) { $desc = $proc.ProcessName }
    $app = $desc
  }
}

$title = ($sb.ToString()) -replace [char]0x1E, ' '
Write-Output ($app + [char]0x1E + $title)
