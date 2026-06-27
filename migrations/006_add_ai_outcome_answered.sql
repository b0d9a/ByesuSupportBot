alter table ai_interactions drop constraint if exists ai_interactions_outcome_check;
alter table ai_interactions add constraint ai_interactions_outcome_check
  check (outcome in ('answered', 'resolved', 'escalated', 'not_confident'));
