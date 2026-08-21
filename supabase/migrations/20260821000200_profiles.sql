create extension if not exists citext;

-- Identity only. Gamification state lives in trainee_stats so the deferred
-- gamification milestone never has to alter this table.
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        public.app_role       not null default 'trainee',
  status      public.profile_status not null default 'pending',
  name        text not null default '',
  email       citext not null unique,
  avatar      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table public.trainee_stats (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  xp             integer not null default 0 check (xp >= 0),
  streak         integer not null default 0 check (streak >= 0),
  last_active_on date,
  created_at     timestamptz not null default now()
);

alter table public.trainee_stats enable row level security;

create index profiles_role_idx   on public.profiles(role);
create index profiles_status_idx on public.profiles(status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
