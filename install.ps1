# NKG Framework installer (Windows)
# Installs the cordis-lite preset + NKG plugin into your DSH user preset root.
$ErrorActionPreference = 'Stop'

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
if (-not (Test-Path $dshHome)) {
  Write-Host "DSH home not found at $dshHome — is DeepSeek Harness installed?" -ForegroundColor Yellow
  Write-Host "Install DSH first, run it once, then re-run this script."
  exit 1
}

$dest = Join-Path $dshHome '.agent-presets\cordis-lite'
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'plugins\nkg') | Out-Null

Copy-Item (Join-Path $PSScriptRoot 'presets\cordis-lite\*') $dest -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'plugins\nkg\index.js') (Join-Path $dest 'plugins\nkg\index.js') -Force

Write-Host ''
Write-Host "Installed cordis-lite + NKG to:" -ForegroundColor Green
Write-Host "  $dest"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Start (or restart) dsh'
Write-Host '  2. Pick the "Cordis Lite" preset in the session picker, or make it the default'
Write-Host "     by adding to $dshHome\settings.yaml:"
Write-Host ''
Write-Host '       agent-presets:'
Write-Host '         default: cordis-lite'
Write-Host ''
Write-Host 'The knowledge graph auto-creates in .git/nkg.json on the first tool event.'
