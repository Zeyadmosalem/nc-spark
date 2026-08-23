create type public.question_type  as enum ('mcq','truefalse','paragraph');
create type public.attempt_status as enum ('in_progress','pending_review','passed','failed','expired');
