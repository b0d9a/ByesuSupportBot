create unique index if not exists faq_candidates_dedup_idx
  on faq_candidates(source_ticket_id, question, proposed_answer)
  where source_ticket_id is not null;
