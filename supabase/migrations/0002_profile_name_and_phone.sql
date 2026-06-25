-- Public name rules + 7-day change cooldown, and optional phone column.
-- full_name stays the PUBLIC (duplicate-allowed) name; username stays internal.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists full_name_changed_at timestamptz;

-- Securely update the public full_name:
--  * exactly two words
--  * Arabic OR English letters and spaces only (no digits/symbols/emoji)
--  * at most once every 7 days (first setup is unrestricted)
-- Returns the new full_name_changed_at so the client can show the live countdown.
create or replace function public.update_full_name(new_name text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  trimmed      text := btrim(new_name);
  last_changed timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- exactly two words of Arabic (؀-ۿ) or Latin letters, space-separated
  if trimmed !~ '^[A-Za-z؀-ۿ]+[ ]+[A-Za-z؀-ۿ]+$' then
    raise exception 'invalid_name_format';
  end if;

  select full_name_changed_at into last_changed from public.profiles where id = uid;

  if last_changed is not null and last_changed > (now() - interval '7 days') then
    raise exception 'name_cooldown';
  end if;

  update public.profiles
     set full_name             = trimmed,
         full_name_changed_at  = now()
   where id = uid;

  return now();
end;
$$;

grant execute on function public.update_full_name(text) to authenticated;
