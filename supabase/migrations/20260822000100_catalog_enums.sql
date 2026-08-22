create type public.course_status     as enum ('draft','published','archived');
create type public.activity_type     as enum ('video','reading','flashcards','matching','scenario','submission','quiz');
create type public.enrollment_status as enum ('pending','active','completed','withdrawn');
create type public.request_status    as enum ('pending','approved','denied');
