# uninstall_service.ps1
# Остановка и удаление службы Бит.Serves.
# Запускать от имени Администратора.

$ErrorActionPreference = "Stop"

$ProjectDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = "Bitserves"
$NssmExe     = Join-Path $ProjectDir "bin\nssm.exe"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Write-Step "Остановка службы '$ServiceName'"
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq "Running") {
        & $NssmExe stop $ServiceName 2>&1 | Out-Null
        Start-Sleep -Seconds 3
    }
    Write-Step "Удаление службы"
    & $NssmExe remove $ServiceName confirm
    Write-Host "    Служба удалена" -ForegroundColor Green
} else {
    Write-Host "    Служба не найдена" -ForegroundColor Yellow
}

Write-Step "Удаление правила брандмауэра"
$rule = Get-NetFirewallRule -DisplayName "Bitserves (port 8000)" -ErrorAction SilentlyContinue
if ($rule) {
    Remove-NetFirewallRule -DisplayName "Bitserves (port 8000)"
    Write-Host "    Правило удалено" -ForegroundColor Green
} else {
    Write-Host "    Правило не найдено" -ForegroundColor Yellow
}

Write-Host "`nГотово. Папка проекта и .venv не тронуты — можно переустановить запуском install_service.ps1" -ForegroundColor Green
