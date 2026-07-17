# Byesu Support Bot

A Telegram support bot that routes user messages **by intent** into per-user forum topics inside a
moderator supergroup, backed by PostgreSQL. It answers common questions deterministically or from a
curated knowledge base (via an optional OpenAI-compatible AI provider), and escalates everything else
to human operators.

> **Note on scope.** This is an application, not a library. `package.json` is marked `"private": true`
> because the project is **not** intended to be published to npm. Clone and run it directly.

## Features

- **Intent-first routing.** Messages are classified by intent, not only by the category a user picks.
  Human-only topics (payments, balance/credential issues, refunds) always open a ticket; known API
  errors and setup questions get a deterministic, knowledge-base-grounded answer first.
- **Deterministic answers** for `401` / `502` / `503` / capacity / stream-disconnect and for CLI setup
  questions — no ticket is opened unless the user asks for a human or the issue is unresolved.
- **Optional AI docs answers.** When enabled, the bot answers only from the bundled knowledge base
  (`src/knowledgeBase.ts`) using a strict, docs-only system prompt. It never behaves as a general chatbot.
- **Human escalation** with full context: the original question, the bot's answer, and the follow-up
  are posted as separate messages in the ticket's moderator topic.
- **Per-user persistent forum topic** and independent ticket records in PostgreSQL.
- **Two-way message relay:** user messages are copied into the moderator topic; operator replies are
  copied back to the user (text, photos, files, voice/video — without downloading files).
- **Learning pipeline.** Every message is stored with both raw and redacted text; reusable Q&A pairs are
  generated **manually** into a review queue (`faq_candidates`) and are never used automatically.
- **Privacy controls:** automatic redaction of API keys, tokens, emails, phone numbers, and long hashes
  before storage, plus a retention job that purges raw text after a configurable window.
- **Localization** (Russian, English, Chinese) for bot-facing UI and answers.
- **Single-instance safety** via a PostgreSQL advisory lock.

## Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL 14+** (a `docker-compose.yml` is provided for local development)
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- A **Telegram supergroup with Topics/Forum enabled**, where the bot is an admin
- *(Optional)* An **OpenAI-compatible AI gateway** API key, if you want AI knowledge-base answers

## Telegram setup

1. Create a supergroup and enable **Topics** (Forum) in its settings.
2. Add the bot to the group as an **administrator**.
3. Grant it rights to **manage topics** (create/edit/close), pin messages, and send messages.
4. Get the supergroup ID (a large negative number, e.g. `-100...`) and set it as `SUPPORT_GROUP_ID`.

## Configuration

Copy `.env.example` to `.env` and fill in real values. Every variable is documented in
[`.env.example`](.env.example).

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather. |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. Used by the bot and `npm run migrate`. |
| `SUPPORT_GROUP_ID` | Yes | — | Integer chat id of the moderator supergroup. |
| `LOG_LEVEL` | No | `info` | `error` \| `warn` \| `info` \| `debug`. |
| `AI_ENABLED` | No | `false` | `true` enables AI knowledge-base answers. |
| `AI_API_KEY` | Conditionally | — | AI gateway key. **Required when `AI_ENABLED=true`.** |
| `AI_BASE_URL` | No | `https://byesu.com/v1` | OpenAI-compatible gateway base URL. |
| `AI_MODEL` | No | `gpt-5.5` | Model name. |
| `SUPPORT_TEXT_RETENTION_DAYS` | No | `90` | Raw-text retention window for the purge job. |

> **Never commit real secrets.** `.env` is git-ignored. See [Secret handling](#secret-handling) below.

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL (local dev database)
docker compose up -d

# 3. Create your env file and fill in BOT_TOKEN + SUPPORT_GROUP_ID
cp .env.example .env      # on Windows: copy .env.example .env

# 4. Apply database migrations
npm run migrate

# 5. Run the bot in watch mode
npm run dev
```

After the bot is running, send `/setup` **in the moderator supergroup**. It creates the service topics
(`General`, `Announcements`, `Open tickets`, `Closed tickets`) and stores their IDs in the database.

If the service topics were deleted manually or the database was restored from another environment, run
`/setup_reset` in the moderator supergroup to clear and recreate the service-topic bindings.

## Database migrations

SQL migrations live in [`migrations/`](migrations) and are applied in filename order, tracked in a
`schema_migrations` table, and wrapped in transactions (idempotent).

```bash
npm run migrate
```

> Always run migrations **before** starting a version that expects new columns/tables. `npm start` also
> runs migrations at boot, but running them explicitly first keeps schema changes easy to diagnose.

## Tests

```bash
npm test            # unit + mocked integration tests (no database required)
npm run lint        # type-check only (tsc --noEmit)
npm run build       # compile TypeScript to dist/
```

Repository/schema integration tests are **skipped unless `INTEGRATION_TEST_DB_URL` is set**, so the
default `npm test` needs no database. To run them against a real Postgres:

```bash
docker run --rm -d --name byesu-itest -e POSTGRES_USER=byesu -e POSTGRES_PASSWORD=byesu \
  -e POSTGRES_DB=byesu_support_test -p 5432:5432 postgres:16
DATABASE_URL=postgresql://byesu:byesu@127.0.0.1:5432/byesu_support_test npm run migrate
INTEGRATION_TEST_DB_URL=postgresql://byesu:byesu@127.0.0.1:5432/byesu_support_test npm test
docker stop byesu-itest
```

## Commands

**User commands** (in a private chat with the bot):

- `/start` — main menu
- `/faq` — frequently asked questions
- `/new` — open a new ticket

**Admin commands** (in the moderator supergroup):

- `/setup` — create or verify the service topics
- `/setup_reset` — recreate the service-topic bindings

**Moderator notes:** any message in a user's topic that starts with `/` is treated as an internal note
and is **not** forwarded to the user.

## How it works

1. A user sends `/start` and picks a category (or just writes a message).
2. The bot classifies the message intent:
   - **Human-only** (payment/balance/refund/account lookup) → open a ticket immediately.
   - **Known API error / setup question** → send a deterministic, KB-grounded answer with
     *resolved* / *need a human* buttons (no ticket yet).
   - **Other support question** → try an AI knowledge-base answer (if enabled); otherwise open a ticket.
3. When a ticket is opened, the bot creates/reuses the user's forum topic and relays messages both ways.
4. Operators reply with normal messages in the topic; the bot copies them back to the user.
5. Buttons on the pinned/service cards let moderators change status, change category, close, or reopen.

See [`docs/manual-qa.md`](docs/manual-qa.md) for the full routing matrix and QA checklist.

## Production

See [`docs/production-runbook.md`](docs/production-runbook.md) for deployment, health checks, database
checks, the learning pipeline, data retention, rollback, and troubleshooting.

## Privacy & data handling

- `support_messages.text` stores **raw user text** and may contain PII/secrets; `text_redacted` holds a
  redacted copy. Use the redacted column for any reporting or sharing.
- The FAQ candidate generator only ever writes redacted text.
- A retention job (`scripts/purge_raw_support_text.ts`) nulls raw text after `SUPPORT_TEXT_RETENTION_DAYS`
  (default 90) while keeping the redacted copy.
- Do not paste raw database exports into external tools.

## Secret handling

- Never commit `.env`, database dumps, chat exports, or logs — they are all git-ignored.
- `.env.example` contains only safe placeholders.
- If a token is ever exposed, **rotate it immediately** (regenerate the bot token via @BotFather, rotate
  the AI key, change the database password).
- Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

Released under the [MIT License](LICENSE).
