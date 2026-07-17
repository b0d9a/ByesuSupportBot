# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately**. Do not open a public GitHub issue for security
problems.

Use GitHub's **[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)**:
go to the repository's **Security** tab → **Report a vulnerability**. This opens a private draft advisory
visible only to maintainers until it is resolved.

Please include:

- a description of the issue and its impact,
- steps to reproduce (proof of concept if possible),
- affected version/commit,
- any suggested remediation.

We aim to acknowledge reports within a few business days and will keep you informed of progress.

## Supported versions

This project is developed on the `main` branch. Security fixes are applied to `main`. There is no
long-term-support branch at this time.

## Handling secrets and user data

This bot processes end-user support conversations that may contain personal data and credentials.

- **Never commit** real bot tokens, API keys, database credentials, database dumps, chat exports, or
  logs. All of these are git-ignored.
- `.env.example` must contain only placeholders.
- Raw message text is stored alongside a redacted copy (`text_redacted`); use the redacted copy for any
  reporting or sharing. A retention job purges raw text after a configurable window.
- If a secret is ever exposed in the repository or its history, **rotate it immediately** (regenerate the
  Telegram bot token via @BotFather, rotate the AI key, change the database password) and remove it from
  history.

## Recommended repository protections

For maintainers, we recommend enabling on GitHub:

- Secret scanning and **push protection**
- Dependabot alerts and security updates
- Branch protection on `main` (required reviews + status checks)
