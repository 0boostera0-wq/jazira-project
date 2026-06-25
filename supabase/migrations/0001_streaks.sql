-- Daily streak system (Asia/Riyadh), persisted in Supabase.
-- New accounts start at 0; increments on the next consecutive Saudi day;
-- resets to 0 after a full missed day; same-day visits never double-count.

create table if not exists public.streaks (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  current_streak   int  not null default 0,
  longest_streak   int  not null default 0,
  last_active_date date,
  updated_at       timestamptz not null default now()
);

alter table public.streaks enable row level security;

drop policy if exists "streaks_select_own" on public.streaks;
create policy "streaks_select_own" on public.streaks
  for select using (auth.uid() = user_id);

-- Authoritative server-side activity recorder. Uses the DB clock in Asia/Riyadh
-- so the day boundary cannot be spoofed by the client.
create or replace function public.record_daily_activity()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  today  date := (now() at time zone 'Asia/Riyadh')::date;
  rec    public.streaks%rowtype;
  result int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into rec from public.streaks where user_id = uid;

  if not found then
    -- Baseline for a brand-new account: 0 today, increments next consecutive day.
    insert into public.streaks (user_id, current_streak, longest_streak, last_active_date)
    values (uid, 0, 0, today);
    return 0;
  end if;

  if rec.last_active_date = today then
    result := rec.current_streak;              -- already counted today
  elsif rec.last_active_date = today - 1 then
    result := rec.current_streak + 1;          -- consecutive Saudi day
  else
    result := 0;                               -- missed a full day → reset
  end if;

  update public.streaks
     set current_streak   = result,
         longest_streak   = greatest(longest_streak, result),
         last_active_date = today,
         updated_at       = now()
   where user_id = uid;

  return result;
end;
$$;

grant execute on function public.record_daily_activity() to authenticated;
