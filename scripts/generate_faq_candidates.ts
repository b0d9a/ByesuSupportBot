/**
 * generate_faq_candidates.ts
 *
 * Reads recent closed tickets, groups their support_messages, applies heuristic
 * filters, and writes approved-looking Q&A pairs to faq_candidates with status
 * 'pending' for human review.
 *
 * IMPORTANT: No AI API calls. No automatic promotion to knowledge base.
 * Candidates require explicit human review before they can affect bot answers.
 *
 * Run: npx tsx scripts/generate_faq_candidates.ts
 */

import pg from "pg";
import { loadDatabaseConfig } from "../src/config.js";
import { redactSupportText } from "../src/redaction.js";
import { SupportRepository } from "../src/repository.js";
import type { SupportMessageRecord } from "../src/types.js";

// ---------------------------------------------------------------------------
// Human-only topic keywords — candidates about these are always skipped.
// ---------------------------------------------------------------------------
const HUMAN_ONLY_PATTERNS: RegExp[] = [
  /usdt|крипто|crypto|transaction|транзакци/i,
  /оплат|payment|pay|заплатил|оплатил|не зачислил/i,
  /промокод|promo.?code/i,
  /баланс.*перенес|перенес.*баланс|transfer.*balance|balance.*transfer/i,
  /баланс.*сброс|reset.*balance|обнул/i,
  /возврат|refund|chargeback/i,
  /реферал|referral/i,
  /партнёрств|партнерств|partnership/i,
  /кастомный лимит|custom.*limit/i,
  /тест.*баланс|test.*balance/i,
  /купить аккаунт|купить подписк|account.*purchase|subscription.*purchase/i,
];

// Short / trivial operator answers to skip
const TRIVIAL_ANSWER_PATTERNS: RegExp[] = [
  /^\s*(ok|ок|окей|done|готово|выполнено|выполнить|подождите|ждите|принято|понял|понятно|хорошо|good|sure|yes|да|нет|no)\s*[.!]?\s*$/i,
  // Waiting / status-only replies that give no actionable information
  /ожидайте/i,
  /скоро будет работать/i,
  /в ближайшее время (все|всё) будет работать/i,
  /^\s*(wait|please wait|will be fixed soon|will work soon)\s*[.!]?\s*$/i,
];

// Account-specific or manual-action wording — skip these answers
const MANUAL_ACTION_PATTERNS: RegExp[] = [
  /ваш аккаунт|ваш баланс|на вашем/i,
  /сделал вручную|вручную|manually|added manually|зачислил|зачислено/i,
  /напишите нам|обратитесь|свяжитесь/i,
];

const MIN_QUESTION_LEN = 20;
const MIN_ANSWER_LEN = 40;

function isHumanOnlyTopic(text: string): boolean {
  return HUMAN_ONLY_PATTERNS.some((p) => p.test(text));
}

function isTrivialAnswer(text: string): boolean {
  return TRIVIAL_ANSWER_PATTERNS.some((p) => p.test(text));
}

function isManualActionAnswer(text: string): boolean {
  return MANUAL_ACTION_PATTERNS.some((p) => p.test(text));
}

function pickUserQuestion(messages: SupportMessageRecord[]): SupportMessageRecord | null {
  return (
    messages.find(
      (m) =>
        m.direction === "user_to_support" &&
        m.senderRole === "user" &&
        m.hasText &&
        (m.text?.length ?? 0) >= MIN_QUESTION_LEN
    ) ?? null
  );
}

function pickOperatorAnswer(messages: SupportMessageRecord[]): SupportMessageRecord | null {
  return (
    messages.find(
      (m) =>
        m.direction === "support_to_user" &&
        m.senderRole === "operator" &&
        m.hasText &&
        (m.text?.length ?? 0) >= MIN_ANSWER_LEN
    ) ?? null
  );
}

async function main(): Promise<void> {
  const { databaseUrl } = loadDatabaseConfig();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  const repo = new SupportRepository(pool);

  // Fetch recent closed ticket messages (last 200 messages from closed tickets)
  const messages = await repo.listRecentClosedTicketMessages(200);

  // Group by ticket_id
  const byTicket = new Map<number, SupportMessageRecord[]>();
  for (const msg of messages) {
    if (!msg.ticketId) continue;
    const group = byTicket.get(msg.ticketId) ?? [];
    group.push(msg);
    byTicket.set(msg.ticketId, group);
  }

  let created = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const [ticketId, ticketMessages] of byTicket) {
    const sorted = ticketMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const questionMsg = pickUserQuestion(sorted);
    const answerMsg = pickOperatorAnswer(sorted);

    if (!questionMsg?.text || !answerMsg?.text) {
      skipped++;
      continue;
    }

    // Never fall back to raw text: if text_redacted is missing (e.g. legacy rows),
    // redact on the fly so raw PII/secrets can never land in a faq_candidate.
    const question = questionMsg.textRedacted ?? redactSupportText(questionMsg.text);
    const answer = answerMsg.textRedacted ?? redactSupportText(answerMsg.text);

    if (isHumanOnlyTopic(question) || isHumanOnlyTopic(answer)) {
      skipped++;
      continue;
    }
    if (isTrivialAnswer(answer)) {
      skipped++;
      continue;
    }
    if (isManualActionAnswer(answer)) {
      skipped++;
      continue;
    }
    // Re-check lengths on redacted text
    if (question.length < MIN_QUESTION_LEN || answer.length < MIN_ANSWER_LEN) {
      skipped++;
      continue;
    }

    const evidenceIds = [questionMsg.id, answerMsg.id];

    const inserted = await repo.addFaqCandidate({
      sourceTicketId: ticketId,
      question,
      proposedAnswer: answer,
      evidenceMessageIds: evidenceIds,
    });
    if (inserted) {
      created++;
      console.log(`[faq-candidates] ticket=${ticketId} created candidate`);
    } else {
      duplicates++;
      console.log(`[faq-candidates] ticket=${ticketId} skipped duplicate`);
    }
  }

  console.log(`Done. Created: ${created}, Skipped: ${skipped}, Duplicates: ${duplicates}`);
  await pool.end();
}

main().catch((err) => {
  console.error("generate_faq_candidates failed:", err);
  process.exit(1);
});
