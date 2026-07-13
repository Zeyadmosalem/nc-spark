-- ============================================================
-- NC SPARK — Database Schema (PostgreSQL / Supabase DDL)
-- ============================================================

-- 1. Profiles Table (Linked to Supabase Auth Users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('admin', 'supervisor', 'trainer', 'trainee')),
  name text not null,
  avatar text,
  email text unique not null,
  xp integer default 0,
  streak integer default 0,
  badges text[] default '{}',
  managed_trainers text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Profiles
alter table public.profiles enable row level security;

-- Policies for Profiles
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- 2. Courses Table
create table public.courses (
  id text primary key,
  title text not null,
  subtitle text,
  trainer_id uuid references public.profiles(id) on delete set null,
  color text default '#002F6C',
  icon text default '📘',
  total_modules integer default 1,
  description text,
  video_id text,
  video_title text,
  quiz_id text,
  activity_id text,
  materials jsonb default '[]'::jsonb,
  stages jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.courses enable row level security;
create policy "Courses are viewable by authenticated users" on public.courses
  for select using (auth.role() = 'authenticated');

-- 3. Enrollments Table
create table public.enrollments (
  id uuid default gen_random_uuid() primary key,
  trainee_id uuid references public.profiles(id) on delete cascade not null,
  course_id text references public.courses(id) on delete cascade not null,
  status text not null check (status in ('pending', 'approved')),
  progress integer default 0 check (progress >= 0 and progress <= 100),
  activity_completions text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(trainee_id, course_id)
);

alter table public.enrollments enable row level security;
create policy "Users can view their own enrollments" on public.enrollments
  for select using (auth.uid() = trainee_id);

-- 4. Chat Messages Table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  course_id text references public.courses(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.messages enable row level security;
create policy "Users can view messages for enrolled courses" on public.messages
  for select using (true);

create policy "Users can send messages to courses" on public.messages
  for insert with check (auth.uid() = user_id);
