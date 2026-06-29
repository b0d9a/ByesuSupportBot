create table if not exists faq_candidates (
  id                   bigserial primary key,
  source_ticket_id     bigint references tickets(id) on delete set null,
  question             text not null,
  proposed_answer      text not null,
  evidence_message_ids jsonb not null default '[]',
  status               text not null default 'pending'
    constraint faq_candidates_status_check
    check (status in ('pending', 'approved', 'rejected')),
  reviewer_note        text,
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz
);

create index if not exists faq_candidates_status_idx           on faq_candidates(status);
create index if not exists faq_candidates_source_ticket_id_idx on faq_candidates(source_ticket_id);
create index if not exists faq_candidates_created_at_idx       on faq_candidates(created_at);
