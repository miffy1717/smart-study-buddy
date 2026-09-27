-- Smart Study Buddy — Supabase schema
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme text default 'theme-navy',
  created_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  subject text not null default 'General',
  deadline timestamptz not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  est_minutes int not null default 30,
  actual_minutes int not null default 0,
  pinned boolean not null default false,
  completed boolean not null default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notebook notes
create table if not exists notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  pen_color text default '#1a2433',
  font text default 'Poppins',
  created_at timestamptz default now()
);

-- Timer sessions (for analytics: weekly hours, actual-vs-estimate)
create table if not exists timer_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null,
  elapsed_seconds int not null,
  created_at timestamptz default now()
);

-- Row Level Security: each student only sees their own rows
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table notes enable row level security;
alter table timer_sessions enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own tasks" on tasks for all using (auth.uid() = user_id);
create policy "own notes" on notes for all using (auth.uid() = user_id);
create policy "own timer sessions" on timer_sessions for all using (auth.uid() = user_id);

-- Keep updated_at fresh on tasks
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_updated_at
before update on tasks
for each row execute function set_updated_at();
