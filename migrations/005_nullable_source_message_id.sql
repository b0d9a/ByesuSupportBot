-- source_message_id can be null when a message is synthesized by the bot
-- (e.g. forwarding an AI-intercepted question to a moderator topic) and there
-- is no corresponding user message_id to record.
alter table message_links alter column source_message_id drop not null;
