create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_state enable row level security;

create policy "Users can read their own state"
on public.app_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own state"
on public.app_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own state"
on public.app_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
