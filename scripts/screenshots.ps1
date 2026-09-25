# Capture README screenshots of the queen sample (Living hidden, chrome-free).
# Requires the app already built and queen.gramps fetched.
# Hive uses a visible Edge app window so WebGL can paint; other views stay headless.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "docs\screenshots"
$assets = Join-Path $root "docs\assets"
New-Item -ItemType Directory -Force -Path $out, $assets | Out-Null

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge not found" }

$listening = Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host "Starting server on 127.0.0.1:5180"
  Start-Process -FilePath "node" -ArgumentList "server.mjs" -WorkingDirectory $root -WindowStyle Hidden
  $ok = $false
  foreach ($i in 1..40) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5180/api/version" -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ok) { throw "server did not answer on port 5180" }
}

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
if (-not ([System.Management.Automation.PSTypeName]"Win32Shot").Type) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Shot {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
}

function Capture-Headless([string]$url, [string]$dest, [int]$budget) {
  if (Test-Path $dest) { Remove-Item $dest -Force }
  $profile = Join-Path $env:TEMP ("ftv-shot-" + [IO.Path]::GetFileName($dest))
  if (Test-Path $profile) { Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath $edge -ArgumentList @(
    "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=2",
    "--user-data-dir=$profile",
    "--window-size=2400,1500", "--virtual-time-budget=$budget",
    "--screenshot=$dest", $url
  ) -Wait | Out-Null
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Path $dest) -and (Get-Item $dest).Length -gt 40000) { break }
    Start-Sleep -Milliseconds 400
  }
}

function Capture-HiveWindow([string]$url, [string]$dest) {
  if (Test-Path $dest) { Remove-Item $dest -Force }
  $profile = Join-Path $env:TEMP "ftv-shot-hive-app"
  if (Test-Path $profile) { Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue }
  $p = Start-Process -FilePath $edge -ArgumentList @(
    "--app=$url",
    "--force-device-scale-factor=1.5",
    "--user-data-dir=$profile",
    "--window-size=1400,900",
    "--window-position=40,40"
  ) -PassThru
  $hwnd = [IntPtr]::Zero
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 500
    $cand = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "Family Tree" -and $_.MainWindowHandle -ne 0 }
    if ($cand) { $hwnd = $cand[0].MainWindowHandle; break }
  }
  if ($hwnd -eq [IntPtr]::Zero) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "Family Tree Edge window not found for hive shot"
  }
  Start-Sleep -Seconds 16
  [Win32Shot]::ShowWindow($hwnd, 9) | Out-Null
  [Win32Shot]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 800
  $rect = New-Object Win32Shot+RECT
  [Win32Shot]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $left = [Math]::Max($rect.Left, $wa.Left)
  $top = [Math]::Max($rect.Top, $wa.Top)
  $right = [Math]::Min($rect.Right, $wa.Right)
  $bottom = [Math]::Min($rect.Bottom, $wa.Bottom)
  $caption = 32
  if (($bottom - ($top + $caption)) -ge 400) { $top += $caption }
  $w = $right - $left
  $h = $bottom - $top
  if ($w -lt 400 -or $h -lt 300) { throw "hive window too small: ${w}x${h} rect=$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)" }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($left, $top, 0, 0, (New-Object System.Drawing.Size $w, $h))
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose()
    $bmp.Dispose()
  }
  Get-Process msedge -ErrorAction SilentlyContinue | Where-Object {
    try { $_.MainWindowTitle -eq "Family Tree" } catch { $false }
  } | Stop-Process -Force -ErrorAction SilentlyContinue
}

$shots = @(
  @{ name = "fan.png"; url = "http://127.0.0.1:5180/?tree=queen&view=fan&shot=1"; budget = 20000 },
  @{ name = "timeline.png"; url = "http://127.0.0.1:5180/?tree=queen&view=timeline&shot=1"; budget = 20000 },
  @{ name = "hints.png"; url = "http://127.0.0.1:5180/?tree=queen&view=hints&shot=1"; budget = 22000 },
  @{ name = "drawer.png"; url = "http://127.0.0.1:5180/?tree=queen&view=fan&person=home&shot=1"; budget = 22000 }
)

Write-Host "hive.png (windowed WebGL)"
$hiveDest = Join-Path $out "hive.png"
Capture-HiveWindow "http://127.0.0.1:5180/?tree=queen&view=hive&shot=1" $hiveDest
if (Test-Path $hiveDest) { Write-Host ("  {0} bytes" -f (Get-Item $hiveDest).Length) }
else { Write-Warning "missing hive.png" }

foreach ($s in $shots) {
  $dest = Join-Path $out $s.name
  Write-Host $s.name
  Capture-Headless $s.url $dest $s.budget
  if (Test-Path $dest) { Write-Host ("  {0} bytes" -f (Get-Item $dest).Length) }
  else { Write-Warning "missing $dest" }
}

if (Test-Path $hiveDest) {
  Copy-Item $hiveDest (Join-Path $assets "hero.png") -Force
}
Write-Host "done $out"
