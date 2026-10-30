# Windows foreground window helper — called via powershell.exe -File.
# Prefer FileDescription for app name; fall back to ProcessName.
# Also emit the exe path so Top Apps can use the real file icon (macOS bundle path equivalent).
# Do not use C# `using` directives: Windows PowerShell treats them as its own
# `using` keyword and fails with "must appear before any other statements".

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not ('Gr8rWin' -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @"
public class Gr8rWin {
  [System.Runtime.InteropServices.DllImport("user32.dll")]
  public static extern System.IntPtr GetForegroundWindow();

  [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
  public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder text, int count);

  [System.Runtime.InteropServices.DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint processId);
}
"@
}

$hwnd = [Gr8rWin]::GetForegroundWindow()
if ($hwnd -eq [System.IntPtr]::Zero) {
  Write-Output ("Desktop" + [char]0x1E + [char]0x1E)
  exit 0
}

$sb = New-Object System.Text.StringBuilder 1024
[void][Gr8rWin]::GetWindowText($hwnd, $sb, $sb.Capacity)
$processId = [uint32]0
[void][Gr8rWin]::GetWindowThreadProcessId($hwnd, [ref]$processId)

$app = "Desktop"
$exe = ""
if ($processId -gt 0) {
  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($proc) {
    $desc = $null
    try { $desc = $proc.MainModule.FileVersionInfo.FileDescription } catch {}
    if ([string]::IsNullOrWhiteSpace($desc)) { $desc = $proc.ProcessName }
    $app = $desc
    try { $exe = $proc.MainModule.FileName } catch {}
    if (-not $exe) {
      try { $exe = $proc.Path } catch {}
    }
  }
}

$title = ($sb.ToString()) -replace [char]0x1E, ' '
$exeSafe = [string]$exe -replace [char]0x1E, ' '
Write-Output ($app + [char]0x1E + $title + [char]0x1E + $exeSafe)
