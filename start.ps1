# Family Tree Viewer launcher: start the hidden Node server (if not already up) and open a chromeless Edge app window.
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $AppDir "server.mjs"
$port = 5180
$url = "http://127.0.0.1:$port/"
$health = "http://127.0.0.1:$port/api/version"
$edgeProfile = Join-Path $env:LOCALAPPDATA "FamilyTreeViewer\profile"

function Test-Tree {
    try {
        $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200 -and $r.Content -match '"version"' -and $r.Content -match '"ingest"'
    } catch { return $false }
}

function Stop-PortListeners {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -and $c.OwningProcess -ne 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required. Install it from https://nodejs.org then run 'Open Family Tree.bat' again."
    exit 1
}
$node = (Get-Command node).Source

Push-Location $AppDir
try {
    if (-not (Test-Path -LiteralPath (Join-Path $AppDir "node_modules"))) {
        Write-Host "Installing dependencies (first run)..."
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }
    $dist = Join-Path $AppDir "dist\index.html"
    $needBuild = -not (Test-Path -LiteralPath $dist)
    if (-not $needBuild) {
        # rebuild when any source file is newer than the last build
        $built = (Get-Item -LiteralPath $dist).LastWriteTime
        $newest = Get-ChildItem -LiteralPath (Join-Path $AppDir "src") -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest -and $newest.LastWriteTime -gt $built) { $needBuild = $true }
    }
    $sampleMarker = Join-Path $AppDir "sample\presidents\US_Presidents_2022-11-02.gramps"
    if (-not (Test-Path -LiteralPath $sampleMarker)) {
        Write-Host "Downloading public sample trees..."
        npm run fetch-samples
        if ($LASTEXITCODE -ne 0) { Write-Warning "Sample download failed; local tree still works if present." }
    }
    if ($needBuild) {
        Write-Host "Building app..."
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
    }
} finally { Pop-Location }

if (-not (Test-Tree)) {
    Stop-PortListeners
    Start-Sleep -Milliseconds 300
    New-Item -ItemType Directory -Force -Path (Join-Path $AppDir ".cache") | Out-Null
    Start-Process -FilePath $node -ArgumentList "`"$Server`"" -WorkingDirectory $AppDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $AppDir ".cache\server.out.log") -RedirectStandardError (Join-Path $AppDir ".cache\server.err.log")
}

$ok = $false
foreach ($i in 1..60) {
    if (Test-Tree) { $ok = $true; break }
    Start-Sleep -Milliseconds 250
}
if (-not $ok) {
    Write-Error "Family Tree server did not come up on $url. See .cache\server.err.log."
    exit 1
}

# Chromeless app window: Edge, then Chrome, then default browser.
$browsers = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($browsers.Count -gt 0) {
    New-Item -ItemType Directory -Force -Path $edgeProfile | Out-Null
    $edgeArgs = @(
        "--app=$url",
        "--window-size=1600,1000",
        "--user-data-dir=`"$edgeProfile`"",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=msEdgeSidebarV2,msHubApps"
    )
    Start-Process -FilePath $browsers[0] -ArgumentList $edgeArgs
} else {
    Start-Process $url
}
Write-Host "Family Tree at $url"
