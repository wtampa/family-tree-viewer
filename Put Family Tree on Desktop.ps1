# Creates "Family Tree.lnk" on the Desktop with the tree icon, pointing at Open Family Tree.bat.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $root "Open Family Tree.bat"
$ico = Join-Path $root "tree.ico"
$png = Join-Path $root "tree-icon.png"

if (-not (Test-Path $ico) -and (Test-Path $png)) {
    python -c @"
from pathlib import Path
p = Path(r'$png')
i = Path(r'$ico')
try:
    from PIL import Image
    Image.open(p).convert('RGBA').resize((256, 256)).save(i, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
except Exception as e:
    print('icon conversion skipped:', e)
"@
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Family Tree.lnk"
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnkPath)
$s.TargetPath = $bat
$s.WorkingDirectory = $root
$s.WindowStyle = 7
$s.Description = "Family Tree viewer (Gramps data.gramps)"
if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
$s.Save()
Write-Host "Desktop shortcut: $lnkPath"
