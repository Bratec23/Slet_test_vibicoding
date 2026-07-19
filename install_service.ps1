# install_service.ps1
# Установка Бит.Serves как службы Windows через NSSM.
# Запускать от имени Администратора на офисном сервере.

$ErrorActionPreference = "Stop"

$ProjectDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName  = "Bitserves"
$ServiceDesc  = "Бит.Serves — микросервис расчёта заработной платы"
$VenvDir      = Join-Path $ProjectDir ".venv"
$VenvPython   = Join-Path $VenvDir "Scripts\python.exe"
$NssmDir      = Join-Path $ProjectDir "bin"
$NssmExe      = Join-Path $NssmDir "nssm.exe"
$Port         = 8000

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "    ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Установка Бит.Serves как службы Windows"    -ForegroundColor Yellow
Write-Host "  Папка проекта: $ProjectDir"                  -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow

# --- 1. Проверка прав администратора ---
Write-Step "Проверка прав администратора"
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Err "Запустите PowerShell от имени Администратора" }

# --- 2. Поиск Python 3.11+ ---
Write-Step "Поиск Python 3.11+"
$pyCandidates = @(
    "C:\Users\Tima\AppData\Local\Programs\Python\Python311\python.exe",
    "C:\Python311\python.exe",
    "C:\Python312\python.exe",
    "C:\Program Files\Python311\python.exe",
    "C:\Program Files\Python312\python.exe"
) + (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
$pyExe = $null
foreach ($p in $pyCandidates) {
    if ($p -and (Test-Path $p)) {
        try {
            $ver = & $p --version 2>&1
            if ($ver -match "Python (3\.1[1-9])") { $pyExe = $p; Write-Ok "$p ($ver)"; break }
        } catch { }
    }
}
if (-not $pyExe) {
    Write-Err "Python 3.11+ не найден. Установите с https://www.python.org/downloads/ (отметьте 'Add to PATH')."
}

# --- 3. Создание venv ---
if (-not (Test-Path $VenvPython)) {
    Write-Step "Создание виртуального окружения: $VenvDir"
    & $pyExe -m venv $VenvDir
    if (-not $?) { Write-Err "Не удалось создать venv" }
    Write-Ok "venv создан"
} else {
    Write-Ok "venv уже есть: $VenvDir"
}

# --- 4. Установка зависимостей ---
Write-Step "Установка зависимостей (requirements.txt)"
& $VenvPython -m pip install --upgrade pip -q
& $VenvPython -m pip install -r (Join-Path $ProjectDir "requirements.txt") -q
if (-not $?) { Write-Err "Ошибка установки зависимостей" }
Write-Ok "Зависимости установлены"

# --- 5. .env ---
$envFile = Join-Path $ProjectDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Step "Копирование .env.example -> .env"
    Copy-Item (Join-Path $ProjectDir ".env.example") $envFile
    Write-Ok ".env создан — обязательно замените SECRET_KEY на длинный случайный"
} else {
    Write-Ok ".env уже существует"
}

# --- 6. Папка data ---
$dataDir = Join-Path $ProjectDir "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Ok "Папка data создана"
}

# --- 7. NSSM ---
if (-not (Test-Path $NssmExe)) {
    Write-Step "Загрузка NSSM (Non-Sucking Service Manager)"
    New-Item -ItemType Directory -Path $NssmDir -Force | Out-Null
    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath = Join-Path $env:TEMP "nssm.zip"
    try {
        Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
        $extractDir = Join-Path $env:TEMP "nssm_extract"
        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
        $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
        $srcNssm = Join-Path $extractDir "nssm-2.24\$arch\nssm.exe"
        Copy-Item $srcNssm $NssmExe -Force
        Write-Ok "NSSM установлен: $NssmExe"
    } catch {
        Write-Err "Не удалось скачать NSSM: $_. Скачайте вручную с https://nssm.cc/ и положите nssm.exe в $NssmDir"
    }
} else {
    Write-Ok "NSSM уже есть: $NssmExe"
}

# --- 8. Удаление старой службы если есть ---
Write-Step "Регистрация службы '$ServiceName'"
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "    Служба уже существует — останавливаю и удаляю" -ForegroundColor Yellow
    if ($existing.Status -eq "Running") { & $NssmExe stop $ServiceName 2>&1 | Out-Null }
    Start-Sleep -Seconds 2
    & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# --- 9. Создание службы ---
& $NssmExe install $ServiceName $VenvPython (Join-Path $ProjectDir "run_server.py")
if (-not $?) { Write-Err "NSSM install failed" }
& $NssmExe set $ServiceName AppDirectory $ProjectDir 2>&1 | Out-Null
& $NssmExe set $ServiceName AppStdout (Join-Path $ProjectDir "logs\service.log") 2>&1 | Out-Null
& $NssmExe set $ServiceName AppStderr (Join-Path $ProjectDir "logs\service.err.log") 2>&1 | Out-Null
& $NssmExe set $ServiceName AppStdoutCreationDisposition 4 2>&1 | Out-Null
& $NssmExe set $ServiceName AppStderrCreationDisposition 4 2>&1 | Out-Null
& $NssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
& $NssmExe set $ServiceName AppRotateOnline 1 2>&1 | Out-Null
& $NssmExe set $ServiceName AppRotateBytes 10485760 2>&1 | Out-Null
& $NssmExe set $ServiceName Description $ServiceDesc 2>&1 | Out-Null
& $NssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
& $NssmExe set $ServiceName AppRestartDelay 5000 2>&1 | Out-Null
& $NssmExe set $ServiceName AppExit Default Restart 2>&1 | Out-Null

$logDir = Join-Path $ProjectDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Write-Ok "Служба зарегистрирована"

# --- 10. Firewall ---
Write-Step "Открытие порта $Port в брандмауэре Windows"
$rule = Get-NetFirewallRule -DisplayName "Bitserves (port $Port)" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule -DisplayName "Bitserves (port $Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
    Write-Ok "Правило добавлено"
} else {
    Write-Ok "Правило уже существует"
}

# --- 11. Старт службы ---
Write-Step "Запуск службы"
& $NssmExe start $ServiceName
Start-Sleep -Seconds 5
$svc = Get-Service -Name $ServiceName
if ($svc.Status -eq "Running") {
    Write-Ok "Служба запущена"
} else {
    Write-Host "    Служба не запустилась — проверьте логи:" -ForegroundColor Yellow
    Write-Host "    $logDir\service.err.log" -ForegroundColor Yellow
    & $NssmExe get $ServiceName AppStderr 2>&1
}

# --- 12. Проверка и IP ---
Write-Step "Проверка доступности"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet|VMware" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 10
    Write-Ok "Локальный запрос: HTTP $($r.StatusCode), длина HTML: $($r.Content.Length)"
} catch {
    Write-Host "    Локальный запрос не прошёл: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  УСТАНОВКА ЗАВЕРШЕНА" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Адреса для пользователей в офисе:" -ForegroundColor White
Write-Host "    http://$ip`:$Port" -ForegroundColor White
Write-Host "    http://127.0.0.1:$Port  (на самом сервере)" -ForegroundColor White
Write-Host ""
Write-Host "  Управление службой:" -ForegroundColor White
Write-Host "    Стоп:  $NssmExe stop $ServiceName" -ForegroundColor Gray
Write-Host "    Старт: $NssmExe start $ServiceName" -ForegroundColor Gray
Write-Host "    Стат:  Get-Service $ServiceName" -ForegroundColor Gray
Write-Host "    Логи:  $logDir\service.log" -ForegroundColor Gray
Write-Host ""
Write-Host "  ВАЖНО:" -ForegroundColor Yellow
Write-Host "    1) Замените SECRET_KEY в .env на длинный случайный (минимум 32 символа)" -ForegroundColor Yellow
Write-Host "    2) После смены .env перезапустите службу: $NssmExe restart $ServiceName" -ForegroundColor Yellow
Write-Host "    3) Резервное копирование: папка $dataDir содержит БД SQLite" -ForegroundColor Yellow
Write-Host ""
