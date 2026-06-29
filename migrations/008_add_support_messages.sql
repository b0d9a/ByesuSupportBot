create table if not exists support_messages (
  id              bigserial primary key,
  ticket_id       bigint references tickets(id) on delete cascade,
  user_id         bigint references users(id) on delete set null,
  direction       text not null
    constraint support_messages_direction_check
    check (direction in ('user_to_support', 'support_to_user', 'bot_to_user', 'bot_to_support')),
  sender_role     text not null
    constraint support_messages_sender_role_check
    check (sender_role in ('user', 'operator', 'bot', 'system')),
  telegram_chat_id    bigint,
  telegram_message_id bigint,
  message_thread_id   bigint,
  text            text,
  text_redacted   text,
  has_text        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists support_messages_ticket_id_idx  on support_messages(ticket_id);
create index if not exists support_messages_user_id_idx    on support_messages(user_id);
create index if not exists support_messages_created_at_idx on support_messages(created_at);
create index if not exists support_messages_direction_idx  on support_messages(direction);
create index if not exists support_messages_sender_role_idx on support_messages(sender_role);
