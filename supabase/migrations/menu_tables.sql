-- Run this in the Supabase SQL Editor

create table if not exists recipes (
  id text primary key,
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  color text not null,
  meals jsonb not null default '[]'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table recipes enable row level security;

create policy "household members can read recipes"
  on recipes for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can insert recipes"
  on recipes for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can update recipes"
  on recipes for update using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can delete recipes"
  on recipes for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );


create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week_key text not null,
  plan jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique(household_id, week_key)
);

alter table meal_plans enable row level security;

create policy "household members can read meal_plans"
  on meal_plans for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can insert meal_plans"
  on meal_plans for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can update meal_plans"
  on meal_plans for update using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "household members can delete meal_plans"
  on meal_plans for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
