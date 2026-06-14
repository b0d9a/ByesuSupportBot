-- Add 'in_review' as a valid ticket status.
--
-- The production schema is not visible in this archive, so this migration
-- handles the most common case: a text column with a CHECK constraint named
-- tickets_status_check.  If the constraint has a different name, or if the
-- column is a PostgreSQL ENUM type, adjust accordingly before running.
--
-- Safe to run on a live database: the ALTER TABLE … DROP / ADD CONSTRAINT
-- pair is transactional in PostgreSQL and does not rewrite the table.

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('open', 'in_review', 'closed'));
