create table if not exists ai_interactions (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  outcome text not null,
  question_length int not null,
  created_at timestamptz not null default now(),
  constraint ai_interactions_outcome_check check (outcome in ('resolved', 'escalated', 'not_confident'))
);

create index if not exists ai_interactions_outcome_idx on ai_interactions(outcome, created_at desc);
create index if not exists ai_interactions_user_idx on ai_interactions(user_id, created_at desc);
