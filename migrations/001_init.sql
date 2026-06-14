create table if not exists users (
  id bigserial primary key,
  telegram_user_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  language_code text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists user_states (
  telegram_user_id bigint primary key,
  selected_category text not null,
  updated_at timestamptz not null default now()
);

create table if not exists user_threads (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  message_thread_id bigint not null unique,
  pinned_message_id bigint,
  topic_title text not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tickets (
  id bigserial primary key,
  public_code text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  category text not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint tickets_status_check check (status in ('open', 'in_review', 'closed'))
);

create index if not exists tickets_user_status_opened_idx
  on tickets(user_id, status, opened_at desc);

create table if not exists service_topics (
  kind text primary key,
  message_thread_id bigint not null unique,
  updated_at timestamptz not null default now(),
  constraint service_topics_kind_check check (kind in ('general', 'announcements', 'open_tickets', 'closed_tickets'))
);

create table if not exists message_links (
  id bigserial primary key,
  ticket_id bigint references tickets(id) on delete set null,
  user_id bigint references users(id) on delete set null,
  direction text not null,
  source_chat_id bigint not null,
  source_message_id bigint not null,
  target_chat_id bigint not null,
  target_message_id bigint not null,
  created_at timestamptz not null default now(),
  constraint message_links_direction_check check (direction in ('user_to_support', 'support_to_user'))
);

create index if not exists message_links_ticket_idx on message_links(ticket_id);
create index if not exists message_links_user_idx on message_links(user_id);

create table if not exists service_cards (
  ticket_id bigint not null references tickets(id) on delete cascade,
  kind text not null,
  message_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ticket_id, kind),
  constraint service_cards_kind_check check (kind in ('open_tickets', 'closed_tickets'))
);
