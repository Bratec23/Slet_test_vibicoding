# Бит.Serves

Единая среда микросервисов для менеджеров. Авторизация по почте+паролю → меню микросервисов → инструмент **«Заработная плата»** (расчёт оклада, премий, сверхурочных и НДФЛ с сохранением истории).

## Архитектура

```
Slet_test_vibicoding/
 ├── Agents.md                   # инструкции агента-разработчика
 ├── README.md
 ├── requirements.txt
 ├── .env.example
 ├── .gitignore
 ├── run_server.py               # точка входа для прод-запуска (uvicorn)
 ├── install_service.ps1         # установка как службы Windows (через NSSM)
 ├── uninstall_service.ps1       # удаление службы
 ├── app/
 │   ├── main.py                 # FastAPI: lifespan, CORS, статика, роутеры
 │   ├── config.py               # настройки из .env (pydantic-settings) + HOST/PORT
 │   ├── database.py             # SQLAlchemy engine/session + init_db + seed
 │   ├── models.py               # Department, Position, Grade, GradeTier, User, PayrollRecord
 │   ├── security.py             # bcrypt + JWT
 │   ├── export.py               # экспорт расчёта в .xlsx (openpyxl)
 │   ├── seed.py                 # сиды: отделы, должности, грейды с tiers
 │   └── routers/
 │       ├── auth.py             # /api/auth: register, login, me
 │       ├── catalog.py          # /api: departments, positions, grades
 │       ├── payroll.py          # /api/payroll: calculate, history, summary, export
 │       └── head.py             # /api/head: dashboard, profitability, costs, history, waterfall
 └── static/
     ├── index.html              # SPA: login → меню микросервисов → ЗП / дашборд руководителя
     ├── styles.css              # дизайн-токены из прототипа (бренд #e5006e)
     └── app.js                  # клиентская логика
```

**Поток:** Менеджер вводит email + пароль → `POST /api/auth/login` → JWT в localStorage → открывается меню микросервисов → выбор «Заработная плата» → расчёт ЗП → `POST /api/payroll/calculate` → сохранение в БД + история. Руководитель видит дашборд отдела, метрики рентабельности и ФОТ/маржа.

## Технологии

- Python 3.12, FastAPI, Uvicorn
- SQLAlchemy 2.0, SQLite
- bcrypt (хэширование паролей) + python-jose (JWT)
- Pydantic v2 (валидация)
- Ванильный HTML/CSS/JS (без сборщиков)

## Установка и запуск (локальная разработка)

```powershell
# 1. Создать виртуальное окружение и установить зависимости
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Скопировать .env.example в .env и при необходимости изменить SECRET_KEY
copy .env.example .env

# 3. Запустить сервер
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Открыть в браузере: http://127.0.0.1:8000

## Разворачивание на офисном сервере (Windows Server)

Сервис устанавливается как служба Windows через NSSM — автозапуск при загрузке сервера, автоматический перезапуск при сбое, доступ по сети для всех пользователей в офисе.

### Требования к серверу

- Windows Server 2016/2019/2022 (или Windows 10/11 Pro)
- **Python 3.11+** — скачать с https://www.python.org/downloads/ (при установке отметить "Add Python to PATH")
- Права администратора
- Свободный порт `8000` (можно изменить в `.env` → `PORT`)

### Установка (одна команда)

Скопировать папку проекта на сервер (например в `C:\Services\Bitserves`) и запустить PowerShell **от имени администратора**:

```powershell
cd C:\Services\Bitserves
.\install_service.ps1
```

Скрипт автоматически:
1. Найдёт Python 3.11+
2. Создаст виртуальное окружение `.venv` и установит зависимости
3. Создаст `.env` из `.env.example` (если ещё нет)
4. Скачает NSSM и зарегистрирует службу `Bitserves`
5. Откроет порт `8000` в брандмауэре Windows
6. Запустит службу и покажет IP-адрес для подключения

В конце скрипт выведет адреса вида:

```
http://192.168.1.50:8000   — для пользователей в офисе
http://127.0.0.1:8000       — на самом сервере
```

Эту ссылку нужно раздать коллегам.

### После установки — обязательно

1. **Заменить `SECRET_KEY` в `.env`** на длинный случайный (минимум 32 символа). Сгенерировать:
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
   ```
2. Перезапустить службу:
   ```powershell
   .\bin\nssm.exe restart Bitserves
   ```
3. Настроить **резервное копирование папки `data/`** (там лежит `bitserves.db` — вся база). Например, ежедневное копирование на сетевой диск или в облако.

### Управление службой

```powershell
.\bin\nssm.exe stop    Bitserves     # остановить
.\bin\nssm.exe start   Bitserves     # запустить
.\bin\nssm.exe restart Bitserves     # перезапустить
Get-Service Bitserves                # статус
Get-Content .\logs\service.log       # журнал приложения
Get-Content .\logs\service.err.log   # журнал ошибок
```

### Обновление версии на сервере

```powershell
cd C:\Services\Bitserves
git pull
.\bin\nssm.exe restart Bitserves
```

Если изменились зависимости — ещё и:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\bin\nssm.exe restart Bitserves
```

### Удаление службы

```powershell
.\uninstall_service.ps1
```

### Что нужно для продакшена / масштабирования

- Заменить `SECRET_KEY` в `.env` на длинный случайный
- Перейти с SQLite на PostgreSQL (`DATABASE_URL=postgresql+psycopg://user:pass@host/db`)
- Настроить `CORS_ORIGINS` на конкретные домены (вместо `*`)
- Поставить nginx как reverse-proxy на 80/443 порту + HTTPS (Let's Encrypt для публичного домена, самоподписанный сертификат — для внутреннего)
- Включить rate-limit и аудит логинов
- Настроить регулярное резервное копирование БД

## Использование

1. На экране входа переключите вкладку «Регистрация», введите ФИО, почту, пароль (≥ 6 символов).
2. После входа откроется меню микросервисов. Выберите «Заработная плата».
3. Добавьте сотрудников: выберите грейд — оклад и процент премии подставятся автоматически.
4. Заполните параметры расчёта: период, отработано дней, рабочих дней в месяце, маржа с услуг, маржа с товара, НДФЛ %.
5. Кнопка «Справка» около полей маржи подскажет, какие столбцы отчёта суммировать.
6. Нажмите «Рассчитать и сохранить» — результат сохранится в историю.

## Грейды

Грейды и их tiers сидируются в БД при первом запуске (`app/seed.py`).

| id | Название | Оклад | % премии | Коэф. услуг | План по марже |
|----|----------|-------|----------|-------------|---------------|
| `trainee` | Испытательный срок | 45 000 ₽ | 4% | 0.5 | нет |
| `mgr1` | Менеджер по продажам, 1 грейд | 37 500 ₽ | динамически | 0.5 | 230 000 ₽ |
| `mgr2` | Менеджер по продажам, 2 грейд | 37 500 ₽ | динамически | 0.5 | 300 000 ₽ |
| `lead1` | Ведущий менеджер, 1 грейд | 42 000 ₽ | динамически | 0.5 | 370 000 ₽ |
| `lead2` | Ведущий менеджер, 2 грейд | 50 000 ₽ | динамически | 0.5 | 420 000 ₽ |

Для грейдов с планом процент премии считается по tiers (`GradeTier`) на основе выполнения плана по марже: `performance_pct = margin_for_plan / plan_margin × 100`. `margin_for_plan` = `(маржа_услуг + маржа_товара) × (1 − VAT_RATE_PERCENT/100)`.

| min % выполнения | `mgr1` | `mgr2` | `lead1` | `lead2` |
|------------------|--------|--------|---------|---------|
| 0%   | 0 | 0 | 0 | 0 |
| 90%  | 4 | 5 | 3 | 3 |
| 101% | 5 | 6 | 6 | 5 |
| 130% | 6 | 7 | 10 | 10 |
| 150% | 7 | 8 | 12 | 12 |
| 200% | 9 | 10 | 14 | 14 |

Чтобы добавить грейд — допишите запись в `GRADES_SEED` в `app/seed.py` и пересоздайте БД (удалите `data/bitserves.db` и перезапустите приложение).

## Формула расчёта

**Расчёт ЗП менеджера** (`/api/payroll/calculate`):

- `margin_for_plan = (маржа_услуг + маржа_товара) × (1 − VAT_RATE_PERCENT/100)`
- `performance_pct = margin_for_plan / plan_margin × 100` (если у грейда есть план)
- `bonus_percent` — берётся из tiers грейда по `performance_pct`, либо фиксированный `grade.bonus_percent` (для грейдов без плана)
- `начислено_оклад = оклад × (отработано_дней / рабочих_дней_в_месяце)`
- `премия_за_услуги = маржа_услуг × коэффициент_услуг × (bonus_percent / 100)`
- `премия_за_товар = маржа_товара × (bonus_percent / 100)`
- `gross = начислено_оклад + премия_за_услуги + премия_за_товар`
- `ндфл = gross × (tax_rate / 100)`  (по умолчанию 13%)
- `к_выплате = gross − ндфл`

**Метрики руководителя** (`/api/head/*`):

- `страховые_взносы = gross × INSURANCE_RATE_PERCENT/100`  (30%)
- `НДС = маржа × VAT_RATE_PERCENT/100`  (5%)
- `офис_на_сотрудника = OFFICE_COST_PER_EMPLOYEE`  (45 000 ₽)
- `ФОТ = gross + НДФЛ + страховые_взносы`
- `операционные = НДС + офис`
- `total_cost = ФОТ + операционные + себестоимость`
- `прибыль = маржа − total_cost`
- `рентабельность = прибыль / маржа × 100`
- `ФОТ/маржа = gross / маржа × 100` — статус: `normal` ≤ 20%, `warning` ≤ 25%, `critical` > 25%

Константы настраиваются в `.env` (см. `app/config.py`): `INSURANCE_RATE_PERCENT`, `VAT_RATE_PERCENT`, `NDFL_RATE_PERCENT`, `OFFICE_COST_PER_EMPLOYEE`, `FOT_MARGIN_NORMAL_PCT`, `FOT_MARGIN_CRITICAL_PCT`.

## Столбцы отчёта для маржи

**Маржа с услуг** = сумма столбцов: Услуги, ЦТО, Регулярное сопровождение — ИТС, Консалтинг, Доставка.

**Маржа с товара** = сумма столбцов: Торговое оборудование, 1С, Промышленное оборудование.

## API

### Авторизация (`/api/auth`)

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| POST  | `/api/auth/register` | Регистрация менеджера/руководителя | — |
| POST  | `/api/auth/login`    | Вход (получение JWT)               | — |
| GET   | `/api/auth/me`       | Текущий пользователь               | Bearer JWT |
| PUT   | `/api/auth/me`       | Обновить ФИО / должность / грейд   | Bearer JWT |

`POST /api/auth/register` принимает JSON:
```json
{
  "full_name": "Иван Иванов",
  "email": "ivan@example.com",
  "password": "secret123",
  "department_id": 1,
  "position_id": 1,
  "grade_id": "trainee",
  "role": "manager"
}
```
Для роли `head` требуется дополнительный пароль `HEAD_REGISTER_PASSWORD` из `.env` (по умолчанию `123456789` — сменить в продакшене). Для `head` поле `grade_id` не нужно.

### Справочники (`/api`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET   | `/api/departments`                  | Список отделов |
| GET   | `/api/positions?department_id=N`    | Должности отдела |
| GET   | `/api/grades`                       | Грейды с tiers |

### Заработная плата (`/api/payroll`, только менеджеры отдела "Развитие АРТ")

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| POST  | `/api/payroll/calculate`            | Расчёт ЗП + сохранение в историю | Bearer JWT |
| GET   | `/api/payroll/history`              | История расчётов текущего пользователя | Bearer JWT |
| GET   | `/api/payroll/summary`              | Сводка по периодам (последняя запись на период) | Bearer JWT |
| GET   | `/api/payroll/records/{id}/export`  | Выгрузка расчёта в `.xlsx` | Bearer JWT |

### Аналитика руководителя (`/api/head`, только роль `head`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET   | `/api/head/dashboard?period=ГГГГ-ММ`           | Дашборд отдела + KPI + метрики по сотрудникам |
| POST  | `/api/head/profitability`                      | Рентабельность по сотрудникам с себестоимостью |
| GET   | `/api/head/costs?period=ГГГГ-ММ`               | Расходы отдела (ФОТ, страховые, НДФЛ, офис, НДС) |
| GET   | `/api/head/history?from=ГГГГ-ММ&to=ГГГГ-ММ`    | История по периодам и сотрудникам |
| GET   | `/api/head/waterfall?period=ГГГГ-ММ`           | Waterfall: изменение маржи vs прошлый месяц |

## Следующие микросервисы

- Календарь проектов
- Аналитика продаж
- Управление заявками