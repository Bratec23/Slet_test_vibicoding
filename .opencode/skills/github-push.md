---
description: Используй для инициализации git-репозитория, создания репозитория на GitHub через GitHub API (curl/gh), коммита и пуша изменений. Применяй, когда нужно залить код проекта на GitHub или обновить удалённый репозиторий.
---

# Skill: GitHub Push

Скилл для работы с GitHub: инициализация git, создание репозитория, коммит и пуш.

## Требования

- Установленный `git` (`winget install Git.Git`)
- Установленный `gh` CLI (`winget install --id GitHub.cli -e --source winget`) ИЛИ персональный токен GitHub (`GITHUB_TOKEN`)
- Авторизация: `gh auth login` или переменная окружения `GITHUB_TOKEN`

## Переменные окружения (.env)

```
GITHUB_USERNAME=<твой_логин>
GITHUB_TOKEN=<твой_персональный_токен>
GITHUB_REPO_NAME=Slet_test_vibicoding
GITHUB_REPO_PRIVATE=false
```

## Шаги

### 1. Проверка авторизации

```powershell
gh auth status
```

Если не авторизован:

```powershell
gh auth login --with-token
```

Или через токен (без gh):

```powershell
$env:GITHUB_TOKEN = "<твой_токен>"
```

### 2. Инициализация локального репозитория

```powershell
git init
git add .
git commit -m "initial commit"
```

### 3. Создание удалённого репозитория

Через gh CLI:

```powershell
gh repo create $env:GITHUB_REPO_NAME --public --source=. --remote=origin --push
```

Через GitHub API (curl/PowerShell) —备用 вариант если gh не установлен:

```powershell
$body = @{ name = $env:GITHUB_REPO_NAME; private = [bool]$env:GITHUB_REPO_PRIVATE } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers @{ Authorization = "Bearer $env:GITHUB_TOKEN" } -Body $body -ContentType "application/json"
git remote add origin "https://github.com/$env:GITHUB_USERNAME/$env:GITHUB_REPO_NAME.git"
git push -u origin master
```

### 4. Пуш последующих изменений

```powershell
git add .
git commit -m "описание изменения"
git push
```

## Результат

- Локальный git-репозиторий инициализирован
- Удалённый репозиторий создан на GitHub
- Код запушен
- URL репозитория выведен в консоль

## Если gh не устанавливается

Используй API GitHub напрямую через `Invoke-RestMethod` (PowerShell встроен), передавая `GITHUB_TOKEN` в заголовке `Authorization`. Это не требует установки дополнительных инструментов.