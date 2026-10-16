# Aggiorna la repository GitHub esistente senza alterare LICENSE o commit precedenti.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = 'https://github.com/sebastianosalzillo/OpenCodeWorkspace.git'
if (Test-Path (Join-Path $root '.git')) {
    Set-Location $root
    $remote = git remote get-url origin 2>$null
    if ($remote -notmatch 'sebastianosalzillo[\/]OpenCodeWorkspace(\.git)?$') {
        throw "Remote origin non corrisponde a OpenCodeWorkspace: $remote"
    }
    git pull --ff-only origin main
} else {
    $target = Join-Path (Split-Path -Parent $root) 'OpenCodeWorkspace-clone'
    if (Test-Path $target) { throw "Cartella già esistente: $target. Usa un clone aggiornato o rinominala." }
    git clone $repo $target
    if ($LASTEXITCODE -ne 0) { throw 'Clonazione GitHub non riuscita' }
    Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -ne '.git' } |
      Copy-Item -Destination $target -Recurse -Force
    Set-Location $target
}
git add .
git status --short
$answer = Read-Host 'Hai verificato che non ci siano password o token? Confermi il push? (SI/no)'
if ($answer -ne 'SI') { throw 'Operazione annullata' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m 'Update OpenCode Workspace'
    if ($LASTEXITCODE -ne 0) { throw 'Commit fallito' }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push fallito' }
Write-Host 'Pubblicazione completata.'
