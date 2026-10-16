# Avvia server e web in due finestre PowerShell, nella stessa directory del progetto.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList '-NoExit','-Command', "Set-Location '$root'; npm run dev:server"
Start-Process powershell -ArgumentList '-NoExit','-Command', "Set-Location '$root'; npm run dev:web"
Write-Host 'Server: http://localhost:3000 | Interfaccia: http://localhost:5173'
