# Copies workflow templates into .github/workflows so GitHub Actions can run them.
# First-time push: PATs without "workflow" scope cannot add files under .github/workflows/;
# push with templates only, then run this script and push again with workflow scope or SSH.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "infrastructure\github-actions"
$dst = Join-Path $root ".github\workflows"
if (-not (Test-Path $src)) { throw "Missing $src" }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Path (Join-Path $src "*.yml") -Destination $dst -Force
Write-Host "Synced *.yml from infrastructure/github-actions to .github/workflows"
Write-Host "Commit and push using a GitHub PAT with 'workflow' scope, or use SSH (git@github.com:...)."
