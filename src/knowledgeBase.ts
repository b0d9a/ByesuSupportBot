/**
 * Byesu support knowledge base — grounding context for the AI assistant.
 *
 * Sources (sole authoritative references):
 *   - https://docs.byesu.com/
 *   - https://byesu.ru/docs
 *
 * Only include facts that are explicitly present in those two sources.
 * Do not add product guesses, undocumented model names, or unverified claims.
 */
export const KNOWLEDGE_BASE = `
# Byesu — полная документация

Byesu — сервис доступа к AI-моделям (OpenAI, Claude, Gemini и др.) через единый API-шлюз.
Доступ предоставляется по API-ключу с балансом. Баланс пополняется через сервис Byesu Code (byesu.ru).

---

## 1. Быстрый старт (docs.byesu.com/guide/quickstart)

Три ключевых понятия:
- **API Key / токен** — ключ доступа вида sk-xxxx, выступает одновременно паролем и кошельком. Не передавать никому.
- **base_url / адрес интерфейса** — адрес, который нужно указать клиенту вместо официального адреса OpenAI/Anthropic.
- **Модель** — название AI-модели, которую хотите использовать; список и точные названия — в консоли.

### Шаг 1 — Создать API-ключ

1. Откройте консоль https://byesu.com и войдите.
2. Перейдите в раздел «Токены» (левая панель) → «Добавить токен».
3. Укажите название (например, codex, cherry), задайте квоту при необходимости → «Подтвердить».
4. Нажмите «Копировать» в списке — получите ключ вида sk-xxxxxxxxxxxx.

Ключ отображается один раз. Не публикуйте его в репозиториях и скриншотах. Скомпрометированный ключ — удалите в консоли и создайте новый.

### Шаг 2 — Выбрать base_url

| Тип клиента                  | base_url                  |
|------------------------------|---------------------------|
| OpenAI / Codex (большинство) | https://byesu.com/v1      |
| Claude / Anthropic           | https://byesu.com (без /v1) |
| Gemini                       | https://byesu.com (без /v1) |

### Шаг 3 — Настроить клиент

Заполните base_url, API Key и модель в настройках выбранного клиента согласно его инструкции.

### Рекомендуемые модели (актуально на момент составления базы)

| Платформа | Модель             | Назначение                        |
|-----------|--------------------|-----------------------------------|
| OpenAI    | gpt-5.5            | Общее / программирование          |
| Claude    | claude-opus-4-8    | Программирование / сложные задачи |
| Gemini    | gemini-3.1-pro-high| Длинный контент / мультимодал     |
| xAI Grok  | grok-420-fast      | Реальное время / скорость         |
| GLM       | a/glm-5.2          | Экономичный вариант               |

Названия моделей должны точно совпадать с указанными в консоли (регистр, дефисы, префиксы a/).
Актуальный список и цены: https://byesu.com (раздел консоли)

---

## 2. Пополнение баланса (byesu.ru/docs)

Byesu Code — сервис пополнения баланса через промокоды. Платите рублями, получаете промокод в USD, активируете в консоли.

### Как пополнить

1. Перейдите на byesu.ru, нажмите «Пополнить баланс».
2. Укажите ваш Telegram username — он связывает заказ с историей и ботом поддержки.
3. Выберите номинал в USD.
4. Выберите способ оплаты: СБП или МИР.
5. Завершите оплату через платёжный сервис Platega. Реквизиты карты вводятся на стороне Platega — Byesu их не хранит и не видит.
6. Дождитесь подтверждения — промокод выдаётся автоматически после server-side подтверждения платежа.

### Статусы заказа

- PENDING — платёж создан, ожидается подтверждение от платёжной системы.
- CONFIRMED — платёж подтверждён, промокод выдан.
- CANCELLED / FAILED — оплата не завершена или отклонена, промокод возвращён в резерв.
- CHARGEBACKED — пользователь открыл спор в банке, требуется ручная проверка поддержкой.

### Расчёт суммы в рублях

RUB = сумма_USD × (курс Rapira USDT/RUB × 1,01) × 1,085

Расшифровка: базовый курс Rapira + наценка 1% за конвертацию + комиссия сервиса 8,5%.
Курс Rapira обновляется в реальном времени — итоговая сумма отображается в форме перед оплатой.

### Если платёж списался, но промокод не пришёл

Не закрывайте страницу заказа. Напишите в поддержку и укажите:
- Telegram username
- номер заказа
- сумму и примерное время оплаты

Реквизиты карты передавать не нужно — поддержка их не запрашивает.

### Когда обращаться в поддержку по оплате

- Платёж прошёл, но код не появился.
- Нужен номинал, которого нет в форме.
- Указан неверный Telegram username.
- Деньги списались, но заказ перешёл в CANCELLED.
- Нужна проверка статуса CHARGEBACKED.

### Возвраты

Промокоды — цифровой товар. Возвраты рассматриваются индивидуально: при технической ошибке на стороне Byesu или случайной операции — обратитесь в поддержку с деталями заказа.

### Данные, которые обрабатывает Byesu Code

- Telegram username, параметры заказа, статус платежа, IP-адрес, user-agent.
- Данные карты хранятся и обрабатываются исключительно Platega — Byesu к ним доступа не имеет.

---

## 3. Настройка клиентов (docs.byesu.com/clients)

Любой клиент с поддержкой OpenAI-совместимого интерфейса подключается через:
- Base URL: https://byesu.com/v1
- API Key: ваш sk-токен из консоли

### Codex CLI (docs.byesu.com/clients/codex-cli)

Base URL: https://byesu.com/v1
Рекомендуемая модель: gpt-5.5 (или gpt-5.3-codex-spark)

Установка:
- npm: npm install -g @openai/codex
- Homebrew: brew install codex

Конфиг (~/.codex/config.toml):
  model = "gpt-5.5"
  model_provider = "byesu"
  wire_api = "responses"          ← обязательно, иначе ошибка 404
  base_url = "https://byesu.com/v1"
  disable_response_storage = true  ← обязательно для сторонних шлюзов
  model_reasoning_effort = "medium"  ← опционально: minimal / low / medium / high

Ключ (~/.codex/auth.json):
  OPENAI_API_KEY = "ваш sk-токен"

Важно: wire_api должен быть "responses" (не "chat"), base_url заканчивается на /v1.

### Claude Code CLI (docs.byesu.com/clients/claude-cli)

Base URL: https://byesu.com (без /v1 — принципиально)
Рекомендуемая модель: claude-opus-4-8

Установка: npm install -g @anthropic-ai/claude-code

Переменные окружения:
- ANTHROPIC_BASE_URL=https://byesu.com
- ANTHROPIC_API_KEY=ваш_sk_токен
  (или ANTHROPIC_AUTH_TOKEN=ваш_sk_токен — если ANTHROPIC_API_KEY не принимается)
- ANTHROPIC_MODEL=claude-opus-4-8 (опционально)

Автоустановка:
- Windows: iex (irm 'https://docs.byesu.com/setup/claude.ps1')
- macOS/Linux: curl -fsSL https://docs.byesu.com/setup/claude.sh | bash

Смена модели внутри сессии: команда /model

### Roo Code (расширение VS Code) (docs.byesu.com/clients/roo-code)

Base URL: https://byesu.com/v1 (с /v1 — обязательно)
Провайдер: OpenAI Compatible
Модели: gpt-5.5, claude-opus-4-8

Установка: VS Code Extensions Marketplace → поиск "Roo Code".
Настройка: иконка Roo Code → шестерёнка → OpenAI Compatible → заполнить Base URL, API Key, Model.
Название модели должно точно совпадать с консолью.

### OpenClaw (docs.byesu.com/clients/openclaw)

Base URL: https://byesu.com/v1
Модели: gpt-5.5, claude-opus-4-8

Настройка через команду openclaw onboard или вручную в ~/.openclaw/openclaw.json:
  "baseUrl": "https://byesu.com/v1"
API-ключ лучше хранить в переменной окружения (например BYESU_API_KEY), не в конфиге.
Параметр mode = "merge" для объединения с встроенными провайдерами.

### Hermes (docs.byesu.com/clients/hermes)

Base URL: https://byesu.com/v1
Провайдер: custom (OpenAI-compatible)
Рекомендуемая модель: gpt-5.5

Настройка через hermes model (выбрать «Custom OpenAI-compatible endpoint») или вручную в ~/.hermes/config.yaml:
  model:
    provider: "custom"
    base_url: "https://byesu.com/v1"
    default: "gpt-5.5"
    api_key: "sk-xxxx"

Ключ можно хранить в ~/.hermes/.env: OPENAI_API_KEY=sk-xxxx

### Cherry Studio и другие GUI-клиенты

API endpoint: https://byesu.com/v1
API Key: из консоли Byesu
Модель: выбрать из списка консоли (название должно точно совпадать)

### Любой другой OpenAI-совместимый клиент

Base URL: https://byesu.com/v1
API Key: ваш sk-токен из консоли
Модель: точное название из консоли Byesu

---

## 4. Генерация изображений и видео (docs.byesu.com/media)

Требует токена группы media / media-gen — обычные GPT/Claude ключи не подойдут (ошибка «no available channels»).

Веб-плейграунд (без кода): https://byesu.com/media/playground.html
Откройте, введите токен, выберите модель, напишите промпт, задайте параметры. Стоимость отображается динамически перед генерацией.

API: POST /v1/images/generations — возвращает base64.

Поддерживаемые модели изображений: gpt-image-2, nano-banana-2, flux-kontext-max, Firefly series.
Поддерживаемые модели видео: gemini-veo31, runway-gen4-turbo, Firefly series.
Поддерживается: image-to-image, image-to-video, выбор длительности и соотношения сторон.

---

## 5. Ошибки API и их решения (docs.byesu.com/errors)

### 401 — Unauthorized / Invalid token
Причина: ключ не передан, скопирован с ошибкой, удалён или недействителен.
Решение: проверьте ключ в консоли (Токены), убедитесь, что нет лишних пробелов, формат sk-xxxx.

### 403 — Forbidden
Причина: ключ действителен, но запрошенная модель или группа недоступна для него.
Решение: проверьте настройки токена в консоли, убедитесь, что модель входит в группу ключа.

### 404 — Not Found
Причина: неверный base_url.
Решение: для OpenAI-совместимых клиентов используйте https://byesu.com/v1 (с /v1); для Claude Code — https://byesu.com (без /v1).

### 429 — Too Many Requests
Причина: слишком много параллельных запросов.
Решение: уменьшите параллелизм в настройках клиента.

### 500 в консоли / белый экран
Причина: Google Translate или другой автопереводчик ломает интерфейс консоли.
Решение: отключите автоперевод страницы в браузере.

### 503 — Service Unavailable / Stream disconnected
Причина: временная перегрузка или недоступность группы моделей.
Решение: подождите и повторите запрос, или попробуйте другую модель.

### insufficient_balance
Причина: закончился баланс аккаунта или исчерпан лимит токена.
Решение: пополните баланс на byesu.ru или увеличьте лимит токена в консоли.

### model_not_found
Причина: неверное или неточное название модели.
Решение: скопируйте точное ID модели из консоли Byesu (регистр, дефисы, префикс a/ — всё важно).

### no available channels
Причина: запрошенная модель не входит в группу вашего API-ключа.
Решение: проверьте группу токена в консоли, создайте новый ключ нужной группы или выберите другую модель.

### Зависание / timeout / reconnect в Codex или Claude Code
Причина: сетевые проблемы, VPN или отсутствие прокси-настроек.
Решение: проверьте VPN, явно пропишите прокси в конфиге инструмента.

### Проблема с параметром reasoning / thinking strength
Причина: разные интерфейсы требуют разный синтаксис: /v1/chat/completions принимает строки, /v1/responses — объекты.
Решение: сверьтесь с документацией конкретного клиента и используйте правильный формат для вашего интерфейса.

---

## 6. Поддержка

Бот поддержки: @byesu_support_bot
Сообщество (чат): https://t.me/byesuchat
Канал Byesu: https://t.me/byesuE

### Как обратиться

Напишите в @byesu_support_bot, выберите тип обращения и опишите проблему. Поддержка ответит в том же диалоге.

При проблеме с API укажите:
- какой клиент используете (Codex, Claude Code, Roo Code и т.д.)
- модель и группу
- точный текст ошибки
- есть ли VPN или прокси
- скриншот, если возможно

При проблеме с оплатой или промокодом укажите:
- Telegram username
- номер заказа
- сумму и примерное время оплаты

Реквизиты карты в поддержку не передавайте — они не нужны и не запрашиваются.
`.trim();
