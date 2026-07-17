# Contributing to Byesu Support Bot

Thanks for your interest in contributing! This document explains how to set up the project and the
expectations for changes.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies and start a local database:
   ```bash
   npm install
   docker compose up -d
   cp .env.example .env   # fill in BOT_TOKEN and SUPPORT_GROUP_ID
   npm run migrate
   ```
3. Run the checks:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

See [`README.md`](README.md) for full setup details.

## Development workflow

- Create a feature branch from `main` (e.g. `feat/…`, `fix/…`, `docs/…`).
- Keep changes focused; avoid unrelated refactors in the same PR.
- Add or update tests for any behavior change. New routing/logic must be covered by tests.
- Run `npm run lint`, `npm test`, and `npm run build` locally before opening a PR — all must pass.
- Use clear, conventional commit messages (e.g. `fix: …`, `feat: …`, `docs: …`, `test: …`).

## Coding guidelines

- TypeScript, ES modules. Match the style of the surrounding code.
- Prefer small, readable functions and descriptive names.
- The bot must **never** behave as a general chatbot: AI answers must remain grounded in the bundled
  knowledge base, and human-only topics must always escalate to an operator.
- Do not add real credentials, real user data, database dumps, or internal reports to the repository.

## Privacy rules for contributors

- Never include real Telegram IDs, usernames, phone numbers, emails, raw support messages, API keys, or
  tokens in code, tests, docs, or commit messages. Use obviously fake placeholders.
- Test fixtures must use synthetic values only.

## Pull requests

- Fill in the PR template.
- Describe what changed and why, and how you tested it.
- Link any related issue.

## Reporting bugs and requesting features

Use the GitHub issue templates. For **security** issues, do **not** open a public issue — follow
[`SECURITY.md`](SECURITY.md).

## Code of conduct

By participating, you agree to abide by our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
