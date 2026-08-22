create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug = lower(slug) and slug <> ''),
  title       text not null check (title <> ''),
  subtitle    text,
  description text,
  trainer_id  uuid references public.profiles(id) on delete set null,
  color       text,
  icon        text,
  status      public.course_status not null default 'draft',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.courses enable row level security;
create index courses_trainer_idx on public.courses(trainer_id);
create index courses_status_idx  on public.courses(status);

create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- The prototype's learning paths are collapsed into this hierarchy: they were
-- already 1:1 with courses. A cross-course curriculum later is additive.
create table public.modules (
  id                     uuid primary key default gen_random_uuid(),
  course_id              uuid not null references public.courses(id) on delete cascade,
  title                  text not null check (title <> ''),
  position               integer not null check (position > 0),
  unlock_after_module_id uuid references public.modules(id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (course_id, position)
);

alter table public.modules enable row level security;
create index modules_course_idx on public.modules(course_id);

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.modules(id) on delete cascade,
  type       public.activity_type not null,
  title      text not null check (title <> ''),
  position   integer not null check (position > 0),
  xp         integer not null default 10 check (xp >= 0),
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (module_id, position),
  -- One table and one query path, but a malformed payload cannot be stored.
  constraint activities_content_shape check (
    case type
      when 'flashcards' then content ? 'cards'
      when 'matching'   then content ? 'pairs'
      when 'scenario'   then content ? 'steps'
      when 'reading'    then content ? 'body'
      when 'video'      then content ? 'videoId'
      else true
    end
  )
);

alter table public.activities enable row level security;
create index activities_module_idx on public.activities(module_id);

create table public.course_materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  name         text not null check (name <> ''),
  kind         text not null check (kind in ('pdf','pptx','docx','xlsx','link')),
  storage_path text,
  external_url text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- A material is either a stored file or an external link, never neither
  -- and never both.
  constraint course_materials_has_target check (
    (storage_path is not null) <> (external_url is not null)
  )
);

alter table public.course_materials enable row level security;
create index course_materials_course_idx on public.course_materials(course_id);
