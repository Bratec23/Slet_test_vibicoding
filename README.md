# Бит.Serves

Единая среда микросервисов для менеджеров. Авторизация по почте+паролю → меню микросервисов → инструмент **«Заработная плата»** (расчёт оклада, премий, сверхурочных и НДФЛ с сохранением истории).

## Архитектура

```
firstbit_ai/
├── Agents.md                   # инструкции агента-разработчика
├── README.md
├── requirements.txt
├── .env.example
├── .gitignore
├── app/
│   ├── main.py                 # FastAPI: lifespan, CORS, статика, роутеры
│   ├── config.py               # настройки из .env (pydantic-settings)
│   ├── database.py             # SQLAlchemy engine/session + init_db
│   ├── models.py               # User, Employee, PayrollRecord
│   ├── security.py             # bcrypt + JWT
│   └── routers/
│       ├── auth.py             # /api/auth: register, login, me
│       └── payroll.py         # /api/payroll: CRUD сотрудников + расчёт ЗП + история
└── static/
    ├── index.html              # SPA: login → меню микросервисов → ЗП
    ├── styles.css              # дизайн-токены из прототипа (бренд #e5006e)
    └── app.js                  # клиентская логика
```

**Поток:** Менеджер вводит email + пароль → `POST /api/auth/login` → JWT в localStorage → открывается меню микросервисов → выбор «Заработная плата» → добавление сотрудников и расчёт ЗП → `POST /api/payroll/calculate` → сохранение в БД + история.

## Технологии

- Python 3.12, FastAPI, Uvicorn
- SQLAlchemy 2.0, SQLite
- bcrypt (хэширование паролей) + python-jose (JWT)
- Pydantic v2 (валидация)
- Ванильный HTML/CSS/JS (без сборщиков)

## Установка и запуск

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

## Использование

1. На экране входа переключите вкладку «Регистрация», введите ФИО, почту, пароль (≥ 6 символов).
2. После входа откроется меню микросервисов. Выберите «Заработная плата».
3. Добавьте сотрудников (ФИО, должность, оклад).
4. Заполните параметры расчёта (период, отработанные/норма дней, премия %, сверхурочные, удержания, НДФЛ %).
5. Нажмите «Рассчитать и сохранить» — результат сохранится в историю.

## Формула расчёта

- `начислено_оклад = оклад × (отработано_дней / норма_дней)`
- `премия = начислено_оклад × (премия% / 100)`
- `сверхурочные = сверхурочные_часы × ставка_сверхурочных`
- `gross = начислено_оклад + премия + сверхурочные − удержания`
- `ндфл = gross × (ндфл% / 100)`
- `к_выплате = gross − ндфл`

## API

| Метод  | Путь                        | Описание                          | Авторизация |
|--------|-----------------------------|-----------------------------------|-------------|
| POST   | `/api/auth/register`        | Регистрация менеджера              | —           |
| POST   | `/api/auth/login`           | Вход (получение JWT)              | —           |
| GET    | `/api/auth/me`              | Текущий пользователь              | Bearer JWT  |
| POST   | `/api/payroll/employees`    | Добавить сотрудника               | Bearer JWT  |
| GET    | `/api/payroll/employees`    | Список сотрудников менеджера      | Bearer JWT  |
| PUT    | `/api/payroll/employees/{id}`| Изменить сотрудника               | Bearer JWT  |
| DELETE | `/api/payroll/employees/{id}`| Удалить сотрудника                | Bearer JWT  |
| POST   | `/api/payroll/calculate`    | Расчёт ЗП + сохранение           | Bearer JWT  |
| GET    | `/api/payroll/history`      | История расчётов                  | Bearer JWT  |

## Следующие микросервисы

- Календарь проектов
- Аналитика продаж
- Управление заявками

## Что нужно для прода

- Заменить `SECRET_KEY` в `.env` на длинный случайный
- Перейти с SQLite на PostgreSQL
- Настроить `CORS_ORIGINS` на конкретные домены
- HTTPS и reverse-proxy (nginx)
- Rate-limit и аудит логинов