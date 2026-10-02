-- VOID predictions must be representable in evaluation rows.
-- Cancelled/postponed/abandoned/suspended matches have no actual result.
alter table public.football_ai_evaluations
  alter column actual_result drop not null,
  alter column predicted_result drop not null;

notify pgrst, 'reload schema';
