# Pubblica aggiornamenti nella repository GitHub esistente.
# Richiede Git, GitHub CLI e: gh auth login
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repo = 'sebastianosalzillo/OpenCodeWorkspace'
if (-not (Test-Path .git)) {
  git init -b main
  git remote add origin "https://github.com/$repo.git"
  git fetch origin main
  git branch -M main
  git reset --soft origin/main
} elseif (-not ((git remote) -contains 'origin')) {
  git remote add origin "https://github.com/$repo.git"
}
git add .
git status --short
Write-Host 'Controlla i file: non pubblicare password, token o .env.'
$answer = Read-Host 'Confermi commit e push su GitHub? (SI/no)'
if ($answer -ne 'SI') { throw 'Operazione annullata' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m 'Update OpenCode Workspace' }
git push -u origin main
