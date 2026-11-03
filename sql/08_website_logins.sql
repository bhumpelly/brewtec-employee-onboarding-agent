-- BrewTec upgrade v8: personal website logins for employees (workflow 5)
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- Every employee gets their own login: work e-mail + password. Passwords are stored only as
-- bcrypt hashes (pgcrypto). Workflow 5 checks the browser's login with website_login() before it
-- sends the website. Disabled accounts are refused, 5 wrong passwords lock the account for
-- 15 minutes, and every login attempt is logged without the password.
--
-- HR creates or resets an account:   select website_user_set('jonas.becker@brewtec.de', 'a-long-password', 'Jonas Becker');
-- HR disables an account (leaver):    select website_user_disable('jonas.becker@brewtec.de');
-- Who logged in:                       select * from website_login_log order by created_at desc;
-- ---------------------------------------------------------------

create table if not exists website_users (
  email           text primary key check (email = lower(email) and email like '%@%'),
  display_name    text,
  employee_id     uuid references employees(id) on delete set null,
  pw_hash         text not null,
  active          boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists website_login_log (
  id         bigserial primary key,
  email      text,
  success    boolean not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_website_login_log_time on website_login_log (created_at);

-- Not reachable through the Supabase API, only through n8n's database login
alter table website_users enable row level security;
alter table website_login_log enable row level security;
revoke all on website_users, website_login_log from anon, authenticated;

-- Create an account or set a new password (also unlocks it)
create or replace function website_user_set (p_email text, p_password text,
                                             p_display_name text default null, p_employee_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Not a valid e-mail address: %', p_email;
  end if;
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'The password needs at least 10 characters.';
  end if;
  insert into website_users (email, display_name, employee_id, pw_hash)
  values (v_email, p_display_name, p_employee_id, crypt(p_password, gen_salt('bf', 10)))
  on conflict (email) do update
    set pw_hash = excluded.pw_hash,
        display_name = coalesce(excluded.display_name, website_users.display_name),
        employee_id = coalesce(excluded.employee_id, website_users.employee_id),
        active = true, failed_attempts = 0, locked_until = null, updated_at = now();
  return v_email;
end;
$$;

-- Disable an account, for example when someone leaves
create or replace function website_user_disable (p_email text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  update website_users set active = false, updated_at = now()
  where email = lower(trim(p_email))
  returning true;
$$;

-- Check the browser's Basic Auth header. Always returns exactly one row.
create or replace function website_login (p_header text)
returns table (ok boolean, user_email text, display_name text, reason text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw   text;
  v_email text;
  v_pw    text;
  u       website_users%rowtype;
begin
  if coalesce(p_header, '') !~* '^basic ' then
    return query select false, null::text, null::text, 'no login'::text;
    return;
  end if;

  begin
    v_raw := convert_from(decode(split_part(p_header, ' ', 2), 'base64'), 'UTF8');
  exception when others then
    return query select false, null::text, null::text, 'unreadable login'::text;
    return;
  end;

  v_email := left(lower(trim(split_part(v_raw, ':', 1))), 120);
  v_pw    := substr(v_raw, length(split_part(v_raw, ':', 1)) + 2);

  -- Keep the login log for one year
  delete from website_login_log where created_at < now() - interval '1 year';

  select * into u from website_users w where w.email = v_email;
  if not found then
    insert into website_login_log (email, success, reason) values (v_email, false, 'unknown user');
    return query select false, null::text, null::text, 'unknown user'::text;
    return;
  end if;

  if not u.active then
    insert into website_login_log (email, success, reason) values (v_email, false, 'disabled');
    return query select false, null::text, null::text, 'disabled'::text;
    return;
  end if;

  if u.locked_until is not null and u.locked_until > now() then
    insert into website_login_log (email, success, reason) values (v_email, false, 'locked');
    return query select false, null::text, null::text, 'locked'::text;
    return;
  end if;

  if u.pw_hash = crypt(v_pw, u.pw_hash) then
    update website_users w set failed_attempts = 0, locked_until = null, last_login_at = now()
    where w.email = v_email;
    insert into website_login_log (email, success, reason) values (v_email, true, 'ok');
    return query select true, u.email, u.display_name, 'ok'::text;
  else
    update website_users w
       set failed_attempts = w.failed_attempts + 1,
           locked_until = case when w.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else w.locked_until end
     where w.email = v_email;
    insert into website_login_log (email, success, reason) values (v_email, false, 'wrong password');
    return query select false, null::text, null::text, 'wrong password'::text;
  end if;
end;
$$;

-- Only n8n's database login may call these functions
revoke execute on function website_user_set(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function website_user_disable(text) from public, anon, authenticated;
revoke execute on function website_login(text) from public, anon, authenticated;
