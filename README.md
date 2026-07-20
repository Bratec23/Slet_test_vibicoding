# Бит.Serves

Единая среда микросервисов для менеджеров. Авторизация по почте+паролю → меню микросервисов → инструмент **«Заработная плата»** (расчёт оклада, премий, НДФЛ с сохранением истории). Руководитель видит дашборд отдела, метрики рентабельности и управляет грейдами через UI.

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
 ├── Dockerfile                  # multi-stage образ
 ├── docker-compose.yml          # запуск через Docker
 ├── .dockerignore
 ├── app/
 │   ├── main.py                 # FastAPI: lifespan, CORS, /health, статика, роутеры
 │   ├── config.py               # настройки из .env (pydantic-settings) + HOST/PORT
 │   ├── database.py             # SQLAlchemy engine/session + init_db + миграция sort_order
 │   ├── models.py               # Department, Position, Grade, GradeTier, User,
 │   │                           #   PayrollRecord, CostPriceRecord, PasswordResetToken, LoginAudit
 │   ├── security.py             # bcrypt + JWT + generate_reset_code
 │   ├── export.py               # экспорт расчёта в .xlsx (openpyxl)
 │   ├── seed.py                 # сиды: отделы, должности, грейды (примеры)
 │   ├── audit.py                # логирование auth-событий
 │   ├── rate_limit.py           # in-memory rate-limit (login/register/forgot/reset)
 │   └── routers/
 │       ├── auth.py             # /api/auth: register, login, me, forgot/verify/reset, audit
 │       ├── catalog.py          # /api: departments, positions, grades
 │       ├── payroll.py          # /api/payroll: calculate, history, summary, export, cost-price
 │       ├── head.py             # /api/head: dashboard, profitability, costs, history, waterfall
 │       └── admin.py            # /api/admin: CRUD грейдов (только head)
 ├── tests/                      # pytest — 50 автотестов
 │   ├── conftest.py             # фикстуры: in-memory SQLite, client, registered_manager
 │   ├── test_health.py
 │   ├── test_auth.py
 │   ├── test_reset.py
 │   ├── test_payroll.py
 │   ├── test_catalog.py
 │   ├── test_audit.py
 │   └── test_grades_admin.py
 └── static/
     ├── index.html              # SPA: login → меню → ЗП / дашборд / грейды
     ├── styles.css              # дизайн-токены (бренд #e5006e)
     └── app.js                  # клиентская логика
```

**Поток:** Менеджер вводит email + пароль → `POST /api/auth/login` → JWT в localStorage → открывается меню микросервисов → выбор «Заработная плата» → расчёт ЗП + себестоимость → `POST /api/payroll/calculate`. Руководитель видит дашборд отдела, управляет грейдами через раздел «Грейды».

## Технологии

- Python 3.11+, FastAPI, Uvicorn
- SQLAlchemy 2.0, SQLite (для прод — PostgreSQL)
- bcrypt (пароли) + python-jose (JWT)
- Pydantic v2 (валидация)
- pytest + httpx (автотесты)
- Docker (multi-stage образ + HEALTHCHECK)
- Ванильный HTML/CSS/JS (без сборщиков)

## Установка и запуск (локальная разработка)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Открыть: http://127.0.0.1:8000

Запуск автотестов:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

Запуск через Docker:

```powershell
docker compose up -d --build
docker compose logs -f
```

## Разворачивание на офисном сервере (Windows Server)

Сервис устанавливается как служба Windows через NSSM — автозапуск при загрузке, перезапуск при сбое, доступ по сети.

### Требования

- Windows Server 2016/2019/2022 (или Windows 10/11 Pro)
- Python 3.11+ (отметить "Add Python to PATH" при установке)
- Права администратора
- Свободный порт `8000` (меняется в `.env` → `PORT`)

### Установка (одна команда)

Скопировать проект на сервер (например в `C:\Services\Bitserves`) и запустить PowerShell **от администратора**:

```powershell
cd C:\Services\Bitserves
.\install_service.ps1
```

Скрипт сам: найдёт Python, создаст venv, установит зависимости, скачает NSSM, зарегистрирует службу `Bitserves`, откроет порт в брандмауэре, запустит службу и покажет IP для подключения.

### После установки — обязательно

1. Заменить `SECRET_KEY` в `.env` на длинный случайный (≥ 32 символа):
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
   ```
2. Сменить `HEAD_REGISTER_PASSWORD` в `.env` (пароль регистрации руководителя)
3. Перезапустить: `.\bin\nssm.exe restart Bitserves`
4. Настроить **бэкап папки `data/`** (там SQLite база `bitserves.db`)

### Управление службой

```powershell
.\bin\nssm.exe stop    Bitserves
.\bin\nssm.exe start   Bitserves
.\bin\nssm.exe restart Bitserves
Get-Service Bitserves
Get-Content .\logs\service.log       # журнал приложения
Get-Content .\logs\service.err.log   # журнал ошибок
```

### Обновление версии на сервере

```powershell
cd C:\Services\Bitserves
git pull
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\bin\nssm.exe restart Bitserves
```

### Удаление службы

```powershell
.\uninstall_service.ps1
```

## Использование

### Менеджер

1. Регистрация: ФИО, отдел, должность, грейд, почта, пароль (≥ 6 символов, буква + цифра)
2. Вход → меню микросервисов → «Заработная плата»
3. Заполнить «Параметры расчёта» (слева): период, отработано дней (по умолчанию 22), рабочих дней, НДФЛ %, маржа с услуг, маржа с товара
4. Заполнить «Себестоимость» (справа) — данные для аналитики руководителя (не влияют на ЗП менеджера)
5. Нажать «Рассчитать и сохранить» — результат сохранится в историю
6. Можно выгрузить расчёт в `.xlsx`

### Руководитель

1. Регистрация: ФИО, отдел, должность "Руководитель...", роль "Руководитель", пароль подтверждения (`HEAD_REGISTER_PASSWORD` из `.env`)
2. Дашборд отдела — KPI, графики, метрики по сотрудникам
3. Аналитика — динамика по месяцам, тепловая карта, водопад
4. Рентабельность — расчёт по сотрудникам с себестоимостью
5. Расходы — ФОТ, НДФЛ, страховые взносы, НДС, офис
6. **Грейды** — CRUD грейдов и tiers через UI

### Сброс пароля

На экране входа: «Забыли пароль?» → ввести почту → получить 6-значный код → ввести код → задать новый пароль.

> Сейчас код пишется в лог сервера (`logs/service.log`, строка `[PASSWORD RESET]`). Для прода нужно подключить SMTP — см. `app/routers/auth.py`, функция `forgot_password`.

## Грейды

Грейды и tiers сидируются в БД при первом запуске (`app/seed.py`). **Это примеры — реальные оклады/планы/проценты настраиваются руководителем через UI** (раздел «Грейды»).

| id | Название (пример) | Оклад | % премии | Коэф. услуг | План по марже |
|----|----------|-------|----------|-------------|---------------|
| `trainee` | Испытательный срок | 30 000 ₽ | 3% | 0.5 | нет |
| `mgr1` | Менеджер, 1 грейд | 35 000 ₽ | динамически | 0.5 | 200 000 ₽ |
| `mgr2` | Менеджер, 2 грейд | 35 000 ₽ | динамически | 0.5 | 250 000 ₽ |
| `lead1` | Ведущий менеджер, 1 грейд | 40 000 ₽ | динамически | 0.5 | 300 000 ₽ |
| `lead2` | Ведущий менеджер, 2 грейд | 45 000 ₽ | динамически | 0.5 | 350 000 ₽ |

Для грейдов с планом процент премии считается по `tiers` (`GradeTier`) на основе выполнения плана: `performance_pct = margin_for_plan / plan_margin × 100`. `margin_for_plan = (маржа_услуг + маржа_товара) × (1 − VAT_RATE_PERCENT/100)`.

Пример tiers для `mgr1`:

| min % выполнения | % премии |
|------------------|----------|
| 0%   | 0 |
| 90%  | 3 |
| 101% | 4 |
| 130% | 5 |
| 150% | 6 |
| 200% | 8 |

**Управление через UI:** раздел «Грейды» (роль `head`) — создание, редактирование всех полей и tiers, архивирование (вместо удаления), восстановление. Нельзя архивировать грейд с активными пользователями.

## Формула расчёта

**Расчёт ЗП менеджера** (`/api/payroll/calculate`):

- `margin_for_plan = (маржа_услуг + маржа_товара) × (1 − VAT_RATE_PERCENT/100)`
- `performance_pct = margin_for_plan / plan_margin × 100` (если у грейда есть план)
- `bonus_percent` — из tiers по `performance_pct`, либо фиксированный `grade.bonus_percent` (для грейдов без плана)
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

Константы в `.env` (см. `app/config.py`): `INSURANCE_RATE_PERCENT`, `VAT_RATE_PERCENT`, `NDFL_RATE_PERCENT`, `OFFICE_COST_PER_EMPLOYEE`, `FOT_MARGIN_NORMAL_PCT`, `FOT_MARGIN_CRITICAL_PCT`, `PASSWORD_RESET_CODE_TTL_MINUTES`.

## Столбцы отчёта для маржи

**Маржа с услуг** = сумма столбцов: Услуги, ЦТО, Регулярное сопровождение — ИТС, Консалтинг, Доставка.

**Маржа с товара** = сумма столбцов: Торговое оборудование, 1С, Промышленное оборудование.

## API

### Система

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| GET   | `/health` | Статус сервиса + проверка БД | — |

### Авторизация (`/api/auth`)

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| POST  | `/api/auth/register`            | Регистрация менеджера/руководителя | — |
| POST  | `/api/auth/login`               | Вход (получение JWT) | — |
| GET   | `/api/auth/me`                  | Текущий пользователь | Bearer JWT |
| PUT   | `/api/auth/me`                  | Обновить ФИО / должность / грейд | Bearer JWT |
| POST  | `/api/auth/forgot-password`     | Запрос 6-значного кода сброса | — |
| POST  | `/api/auth/verify-reset-code`   | Проверка кода | — |
| POST  | `/api/auth/reset-password`      | Смена пароля по коду | — |
| GET   | `/api/auth/audit/me`            | Свои события аудита (логины/сбросы) | Bearer JWT |
| GET   | `/api/auth/audit/department`    | Аудит по отделу (только head) | Bearer JWT (head) |

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
Для `head`: поле `grade_id` не нужно, дополнительно `head_register_password` (значение `HEAD_REGISTER_PASSWORD` из `.env`).

**Rate-limit:** `/login` 5/мин, `/register` 3/мин, `/forgot-password` 3/мин, `/reset-password` 5/мин. При превышении — HTTP 429 + `Retry-After`.

### Справочники (`/api`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET   | `/api/departments`                  | Список отделов |
| GET   | `/api/positions?department_id=N`    | Должности отдела |
| GET   | `/api/grades`                       | Активные грейды с tiers (сортировка по sort_order) |

### Заработная плата (`/api/payroll`, только менеджеры отдела "Развитие АРТ")

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| POST  | `/api/payroll/calculate`            | Расчёт ЗП + сохранение в историю | Bearer JWT |
| GET   | `/api/payroll/history`              | История расчётов | Bearer JWT |
| GET   | `/api/payroll/summary`              | Сводка по периодам | Bearer JWT |
| GET   | `/api/payroll/records/{id}/export`  | Выгрузка расчёта в `.xlsx` | Bearer JWT |
| POST  | `/api/payroll/cost-price`           | Сохранить себестоимость за период | Bearer JWT |
| GET   | `/api/payroll/cost-price?period=ГГГГ-ММ` | Получить себестоимость | Bearer JWT |

### Аналитика руководителя (`/api/head`, только роль `head`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET   | `/api/head/dashboard?period=ГГГГ-ММ`           | Дашборд отдела + KPI + метрики |
| POST  | `/api/head/profitability`                      | Рентабельность с себестоимостью |
| GET   | `/api/head/costs?period=ГГГГ-ММ`               | Расходы (ФОТ, НДФЛ, взносы, НДС, офис) |
| GET   | `/api/head/history?from=ГГГГ-ММ&to=ГГГГ-ММ`    | История по периодам и сотрудникам |
| GET   | `/api/head/waterfall?period=ГГГГ-ММ`           | Waterfall: изменение маржи vs прошлый месяц |

Себестоимость берётся из `CostPriceRecord`, сохранённых менеджерами через `/api/payroll/cost-price`. В `/api/head/profitability` можно передать свою `cost_price > 0` — она приоритетнее.

### Админка грейдов (`/api/admin`, только роль `head`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET   | `/api/admin/grades`                       | Список всех грейдов (включая архив) |
| POST  | `/api/admin/grades`                       | Создать грейд |
| PUT   | `/api/admin/grades/{id}`                  | Обновить грейд (поля + tiers) |
| DELETE| `/api/admin/grades/{id}`                  | Архивировать (is_active=false) |
| POST  | `/api/admin/grades/{id}/restore`          | Восстановить из архива |

## Тесты

50 автотестов покрывают: health, авторизацию (валидация пароля/email, регистрация head, дубликаты), сброс пароля (полный flow, повторное использование кода, слабые пароли), расчёт ЗП, себестоимость, экспорт xlsx, аудит логинов, CRUD грейдов (создание/обновление/архив/восстановление/защиту от удаления с пользователями), каталог.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

## Безопасность

- Пароли хэшируются bcrypt
- JWT с TTL `ACCESS_TOKEN_EXPIRE_MINUTES` (по умолчанию 1440 мин)
- Коды сброса пароля хэшируются bcrypt, одноразовые, TTL 15 мин (настраивается `PASSWORD_RESET_CODE_TTL_MINUTES`)
- Rate-limit на auth-роутах (in-memory)
- Аудит всех auth-событий: регистрация, вход (успех/провал), сброс пароля — с IP и User-Agent
- Регистрация руководителя защищена отдельным паролем `HEAD_REGISTER_PASSWORD`

## Что нужно для продакшена

- Заменить `SECRET_KEY` в `.env` на длинный случайный
- Сменить `HEAD_REGISTER_PASSWORD` в `.env`
- Перейти с SQLite на PostgreSQL (`DATABASE_URL=postgresql+psycopg://user:pass@host/db`)
- Настроить `CORS_ORIGINS` на конкретные домены (вместо `*`)
- Поставить nginx как reverse-proxy на 80/443 + HTTPS (Let's Encrypt для публичного домена)
- Подключить SMTP для отправки кодов сброса пароля на почту (сейчас код в логе сервера)
- Настроить регулярное резервное копирование БД
- Rate-limit вынести в Redis (сейчас in-memory, не работает для multi-instance)

## Следующие микросервисы

- Календарь проектов
- Аналитика продаж
- Управление заявками
