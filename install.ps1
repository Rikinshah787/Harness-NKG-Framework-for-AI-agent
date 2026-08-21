# NKG Framework installer (Windows)
# Installs all bundled presets (cordis-lite, sec-agent) + NKG plugin into your DSH user preset root.
$ErrorActionPreference = 'Stop'

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
if (-not (Test-Path $dshHome)) {
  Write-Host "DSH home not found at $dshHome - is DeepSeek Harness installed?" -ForegroundColor Yellow
  Write-Host "Install DSH first, run it once, then re-run this script."
  exit 1
}

$installed = @()
Get-ChildItem (Join-Path $PSScriptRoot 'presets') -Directory | ForEach-Object {
  $dest = Join-Path $dshHome ".agent-presets\$($_.Name)"
  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'plugins\nkg') | Out-Null
  Copy-Item (Join-Path $_.FullName '*') $dest -Recurse -Force
  Copy-Item (Join-Path $PSScriptRoot 'plugins\nkg\index.js') (Join-Path $dest 'plugins\nkg\index.js') -Force
  $installed += $dest
}

Write-Host ''
Write-Host 'Installed presets (each with the NKG plugin):' -ForegroundColor Green
$installed | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Start (or restart) dsh'
Write-Host '  2. Pick "Cordis Lite" or "Sec Agent" in the session picker, or make one the default'
Write-Host "     by adding to $dshHome\settings.yaml:"
Write-Host ''
Write-Host '       agent-presets:'
Write-Host '         default: cordis-lite'
Write-Host ''
Write-Host 'The knowledge graph auto-creates in .git/nkg.json on the first tool event.'