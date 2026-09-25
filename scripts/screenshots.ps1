# Capture README screenshots of the queen sample (Living hidden).
# Requires the app already built and queen.gramps fetched.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "docs\screenshots"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$edge = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
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

$shots = @(
  @{ name = "hive.png"; url = "http://127.0.0.1:5180/?tree=queen&view=hive" },
  @{ name = "fan.png"; url = "http://127.0.0.1:5180/?tree=queen&view=fan" },
  @{ name = "timeline.png"; url = "http://127.0.0.1:5180/?tree=queen&view=timeline" },
  @{ name = "hints.png"; url = "http://127.0.0.1:5180/?tree=queen&view=hints" },
  @{ name = "drawer.png"; url = "http://127.0.0.1:5180/?tree=queen&view=fan&person=home" }
)

foreach ($s in $shots) {
  $dest = Join-Path $out $s.name
  if (Test-Path $dest) { Remove-Item $dest -Force }
  $profile = Join-Path $env:TEMP ("ftv-shot-" + $s.name)
  Write-Host $s.name
  Start-Process -FilePath $edge -ArgumentList @(
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--user-data-dir=$profile",
    "--window-size=1800,1100", "--virtual-time-budget=25000",
    "--screenshot=$dest", $s.url
  ) -Wait | Out-Null
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Path $dest) -and (Get-Item $dest).Length -gt 40000) { break }
    Start-Sleep -Milliseconds 400
  }
  if (Test-Path $dest) { Write-Host ("  {0} bytes" -f (Get-Item $dest).Length) } else { Write-Warning "missing $dest" }
}
if (Test-Path (Join-Path $out "hive.png")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root "docs\assets") | Out-Null
  Copy-Item (Join-Path $out "hive.png") (Join-Path $root "docs\assets\hero.png") -Force
}
Write-Host "done $out"
