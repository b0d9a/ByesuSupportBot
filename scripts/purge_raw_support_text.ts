/**
 * purge_raw_support_text.ts
 *
 * Data-retention job (audit finding M1). Nulls the RAW `support_messages.text`
 * column for rows older than the retention window, while keeping the redacted
 * copy (`text_redacted`) for operator review and the learning pipeline.
 *
 * Rationale: `text` holds raw user input that may contain PII/secrets. Redaction
 * is best-effort, so raw text should not be retained indefinitely. This job caps
 * the raw-text retention window without deleting the message rows themselves
 * (ticket history, message_links, and redacted text remain intact).
 *
 * Configure the window via SUPPORT_TEXT_RETENTION_DAYS (default 90).
 * Run (e.g. daily via cron / scheduled task):
 *   npx tsx scripts/purge_raw_support_text.ts
 */

import pg from "pg";
import { loadDatabaseConfig } from "../src/config.js";

const DEFAULT_RETENTION_DAYS = 90;

function retentionDays(): number {
  const raw = process.env.SUPPORT_TEXT_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error("SUPPORT_TEXT_RETENTION_DAYS must be a positive integer");
  }
  return n;
}

async function main(): Promise<void> {
  const days = retentionDays();
  const { databaseUrl } = loadDatabaseConfig();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // Only touch rows that still hold raw text and are past the window.
    const result = await pool.query(
      `
        update support_messages
        set text = null
        where text is not null
          and created_at < now() - ($1::int * interval '1 day')
      `,
      [days]
    );
    console.log(`Purged raw text from ${result.rowCount ?? 0} support_messages rows older than ${days} days (text_redacted kept).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("purge_raw_support_text failed:", err);
  process.exit(1);
});
