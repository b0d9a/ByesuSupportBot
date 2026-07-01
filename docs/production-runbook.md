# ByesuSupportBot — Production Runbook

Concise operational guide for deploying, updating, and troubleshooting the bot in production.

## Overview

ByesuSupportBot is a Telegram support bot that routes user messages **by intent**, not by the category the user picked:

- **AI docs-only answers** — for general support questions, the bot answers from the Byesu knowledge base (when `AI_ENABLED=true`) and never acts as a general chatbot.
- **Deterministic answers** — known issues get a fixed, KB-grounded reply without opening a ticket:
  - `401` / invalid token / unauthorized → key-check answer
  - `502` / `503` / capacity / stream disconnected → overload answer
  - Codex CLI setup / configuration → Codex config answer
- **Human escalation** — a ticket opens only when needed (see [manual-qa.md](manual-qa.md)): human-only topics (payment/balance/refund/etc.), an explicit request for a human, dissatisfaction after an answer, or an unknown/unresolved message. Each deterministic/AI answer shows *resolved* / *need human* buttons.
- **Learning storage** — every user/bot/operator message is stored in `support_messages` (raw + redacted). Reusable Q&A pairs are later generated **manually** into `faq_candidates` for human review.

## Required infrastructure

- **PostgreSQL** database reachable via `DATABASE_URL`.
- **Telegram bot token** from @BotFather (`BOT_TOKEN`).
- **Telegram support forum supergroup** with **forum topics enabled** (`SUPPORT_GROUP_ID`).
- **Bot admin rights** in that support group (needed to create/close forum topics).
- **Byesu / OpenAI-compatible AI gateway key** (`AI_API_KEY`) if AI answers are enabled.

## Required Telegram permissions

The bot must be able to:

- read private user messages (DMs);
- send private messages to users;
- create forum topics in the support group;
- send messages into those topics;
- copy/forward user messages into the support group;
- receive operator replies posted in the support group topics.

In practice: add the bot to the support group as an **administrator**, enable **Topics** on the group, and grant "Manage Topics" so it can create and close ticket topics.

## Environment variables

See [`.env.example`](../.env.example) for the copy-paste template. Summary:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather. Bot won't start without it. |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. Used by the bot and by `npm run migrate`. |
| `SUPPORT_GROUP_ID` | Yes | — | Integer chat id of the support forum supergroup (usually a large negative number). |
| `LOG_LEVEL` | No | `info` | Log verbosity: `error`, `warn`, `info`, `debug`. |
| `AI_ENABLED` | No | `false` | `true` enables AI docs answers; anything else disables them. |
| `AI_API_KEY` | Conditionally | — | AI gateway key. **Required when `AI_ENABLED=true`** — the bot fails fast otherwise. |
| `AI_BASE_URL` | No | `https://byesu.com/v1` | AI gateway base URL. |
| `AI_MODEL` | No | `gpt-5.5` | AI model name. |

## First deployment

```bash
npm ci
npm run build
npm run migrate
npm start
```

> **Run migrations before starting** any version that expects new DB columns/tables. `npm start` also runs migrations at boot (see `src/index.ts`), but running `npm run migrate` explicitly first keeps schema changes separate from process start and makes failures easier to diagnose.

## Updating an existing deployment

```bash
git pull
npm ci
npm run build
npm test
npm run migrate
# then restart the process/service (e.g. pm2 restart, systemctl restart, container redeploy)
```

## Manual QA before enabling for users

Run the full checklist in [manual-qa.md](manual-qa.md). Highest-priority smoke cases:

- `/start` language selection works (trilingual selector on first run).
- Codex setup natural phrase (e.g. `че надо чтобы в кодексе все работало`) → Codex setup answer, no ticket.
- `401` / invalid token → 401 auto-answer, no ticket.
- `502` / `503` / capacity → 502/503 auto-answer, no ticket.
- Same-intent repeat (e.g. `почему у меня 401` after a 401 answer) → re-answers, **does not** open a ticket.
- `не помогло` after an answer → opens a ticket with context.
- Payment / USDT / balance-not-credited → opens a ticket immediately, no AI/deterministic answer.
- Off-topic / jailbreak → the bot does **not** become a general chatbot.

## Health checks / logs

**Windows local dev:**

```powershell
Get-Content logs\bot-out.log -Tail 50
Get-Content logs\bot-error.log -Tail 80
```

**Production (generic):**

- Check the process manager logs (`pm2 logs`, `journalctl -u byesusupportbot`, or container logs).
- Confirm the startup line `Bot started as @<username>` appears once per running instance.
- Verify DB connectivity (see database checks below) and watch for repeated Telegram API errors (401 Unauthorized token, 403 bot blocked/removed, 429 rate limits).
- Only one instance should hold the advisory lock; a second instance logs `Another bot instance is already running` and exits.

## Database checks

```sql
select count(*) from users;
select status, count(*) from tickets group by status;
select count(*) from support_messages;
select id, status, source_ticket_id from faq_candidates order by created_at desc limit 20;
```

Local dev via docker compose:

```powershell
docker compose exec -T postgres psql -U byesu -d byesu_support_dev -c "select status, count(*) from tickets group by status;"
```

## Learning pipeline

- `support_messages` stores both raw (`text`) and redacted (`text_redacted`) message text for every user/bot/operator turn.
- `faq_candidates` are **generated manually** — the bot never writes them during normal operation.
- Candidates start as `pending` and are **never used by the bot**; they require explicit human review/approval before they could influence answers.
- To generate candidates from recent closed tickets:

```bash
npx tsx scripts/generate_faq_candidates.ts
```

See [learning-pipeline.md](learning-pipeline.md) for details on filtering and review.

## Privacy / data handling

- `support_messages.text` contains **raw user text** and may include PII or secrets (API keys, tokens, emails, transaction hashes, phone numbers).
- Use **`text_redacted`** for any reporting, screenshots, or sharing.
- **Do not** paste raw DB exports into external tools, LLMs, or dashboards.
- **TODO:** define and implement a data retention / purge policy for `support_messages` (currently retained indefinitely).

## Rollback

- Keep the previous build/container/tag available so you can revert quickly.
- **Roll back the application version first** — this resolves most incidents without touching data.
- **DB migrations are forward-only** unless a specific rollback migration exists; do not assume a migration can be undone.
- **Take a database backup before running migrations in production**, so you can restore if a migration plus a rolled-back app version become incompatible.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Bot starts but does not create topics | Missing admin rights or Topics not enabled in the support group. Make the bot an admin with "Manage Topics" and enable forum Topics. |
| User messages are not forwarded to the group | Wrong `SUPPORT_GROUP_ID` (or bot not in that group). Verify the numeric id and group membership. |
| AI never answers | `AI_ENABLED` not `true`, missing/invalid `AI_API_KEY`, or unreachable `AI_BASE_URL`. Note: with `AI_ENABLED=true` and no key, the bot fails to start. |
| First-run users seem stuck | Expected onboarding: a user with no saved interface language sees only the language selector until they pick one. |
| `generate_faq_candidates.ts` cannot connect | `DATABASE_URL` missing from `.env` or unreachable DB. The script loads `.env` via `loadDatabaseConfig()`. |
