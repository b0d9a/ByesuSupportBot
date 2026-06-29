# Learning Pipeline

## What is stored

Every meaningful message in a support conversation is persisted in the `support_messages` table. This includes:

- **User messages** (`direction = user_to_support`, `sender_role = user`): the user's first question when a ticket is created, and all follow-up messages while a ticket is active.
- **Operator replies** (`direction = support_to_user`, `sender_role = operator`): text messages that operators send in the support forum topic and that the bot forwards to the user.
- **Bot answers to user** (`direction = bot_to_user`, `sender_role = bot | system`): deterministic 503/401 auto-answers, AI-generated answers shown to the user, payment acknowledgment messages, and ticket-opened confirmations.
- **Bot context to support** (`direction = bot_to_support`, `sender_role = bot`): the moderator-facing copies of the original question, bot answer, and follow-up that the bot posts into the support forum topic.

## Raw vs redacted text

Each row stores two text columns:

| Column | Contents |
|--------|----------|
| `text` | Raw original text, never modified |
| `text_redacted` | Copy with sensitive data replaced by tokens such as `[REDACTED_API_KEY]`, `[REDACTED_EMAIL]`, `[REDACTED_BOT_TOKEN]`, and partial hex hashes like `0x1234...[REDACTED]...abcd` |

The `has_text` boolean is `true` when `text` is non-null and non-empty.

Redaction is applied at write time using `src/redaction.ts`. The raw `text` column is retained for operator review purposes only and must be treated as sensitive.

### What is redacted

- OpenAI/Byesu API keys matching `sk-...` (16+ characters after prefix)
- Telegram bot tokens (`digits:letters` format)
- Email addresses
- Long hex strings / transaction hashes (32+ hex chars) — kept as partial `prefix_first4...[REDACTED]...last4`
- International phone numbers (conservatively)

## What is never auto-learned

The learning pipeline enforces a strict human review gate:

1. `support_messages` stores raw conversation text. This data is **never** fed directly to the AI model as context or training data.
2. `faq_candidates` holds candidate Q&A pairs extracted from closed tickets by the `scripts/generate_faq_candidates.ts` script. All candidates start with `status = 'pending'`.
3. **No candidate with `status = 'pending'` or `status = 'rejected'` is ever used in AI prompts.**
4. Even `approved` candidates are not yet wired into `src/knowledgeBase.ts` — that is a future step requiring an explicit engineering decision and deployment.

## FAQ candidates require human approval

The `generate_faq_candidates.ts` script applies heuristic filters to identify clean Q&A pairs from closed support conversations:

- Skips questions about payments, crypto/USDT, balance transfers/resets, refunds, referrals, partnerships, custom limits, test balances, and account/subscription purchases.
- Skips trivial operator replies ("OK", "готово", "done", etc.).
- Skips replies that contain account-specific or manual-action wording.
- Skips questions or answers that are too short to be useful.

After the script runs, an operator must review each `pending` candidate in the database and set its `status` to `approved` or `rejected` using `updateFaqCandidateStatus`. There is no automatic promotion.

## Human-only topics always remain human-only

The following topics are excluded from candidate generation and will never be auto-answered by AI, regardless of what is stored in the learning pipeline:

- Payment not credited / USDT / crypto
- Balance transfer, reset, or disappearance
- Refunds or chargebacks
- Referral or partnership programs
- Custom limits
- Test balances
- Account or subscription purchases
- Promo codes with billing issues

This restriction is enforced both in the candidate generator and in `src/botUtils.ts` (`isHumanOnlySupportMessage`).

## Approved knowledge integration — future step

After a human approves candidates, a future pipeline step will:

1. Export approved candidates from `faq_candidates` where `status = 'approved'`.
2. Human-review the final text for accuracy and safety.
3. Add the reviewed entries to `src/knowledgeBase.ts` (or equivalent).
4. Deploy a new bot version with the updated knowledge base.

No automated path from `approved` status to live bot answers exists today.

## Privacy and data handling

- `support_messages.text` contains raw user messages. Treat as PII / sensitive.
- Do not expose `text` in reports or logs.
- Use `text_redacted` for analysis, candidate generation, and any external review.
- The `message_links` table continues to store Telegram message IDs for routing; `support_messages` adds the actual text.
- Migration `008_add_support_messages.sql` and `009_add_faq_candidates.sql` must be applied before deploying.
