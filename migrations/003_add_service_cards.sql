create table if not exists service_cards (
  ticket_id bigint not null references tickets(id) on delete cascade,
  kind text not null,
  message_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ticket_id, kind),
  constraint service_cards_kind_check check (kind in ('open_tickets', 'closed_tickets'))
);
