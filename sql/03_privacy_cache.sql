-- Upgrade v3: answer cache, access code protection, data retention and erasure.
-- Run once in the Supabase SQL Editor after 01_schema.sql (and 02_reliability.sql).
-- Safe to run again. Existing data is kept.

-- ---------------------------------------------------------------
-- 1. Answer cache for repeated handbook questions (workflow 3)
-- Only verified, non-personal answers are stored. Workflow 2 empties the cache after every
-- successful knowledge base update, so a cached answer never outlives its source document.
-- ---------------------------------------------------------------
create table if not exists answer_cache (
  id           bigserial primary key,
  question_key text not null unique,
  question     text not null,
  answer       text not null,
  sources      text not null,
  hits         int not null default 0,
  created_at   timestamptz not null default now(),
  last_hit_at  timestamptz
);

-- ---------------------------------------------------------------
-- 2. Access code attempts (brute-force protection for onboarding_status)
-- Stores only the chat session id and the outcome, never the code that was tried.
-- ---------------------------------------------------------------
create table if not exists code_attempts (
  id          bigserial primary key,
  session_id  text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_code_attempts_time on code_attempts (created_at);
create index if not exists idx_chat_created on chat_messages (created_at);

-- ---------------------------------------------------------------
-- 3. onboarding_status with lockout and code expiry
-- Locked after 5 wrong codes in one chat session within 30 minutes, and for everyone after
-- 30 wrong codes in 10 minutes (guessing across many sessions). A code works until 30 days
-- after the start date.
-- ---------------------------------------------------------------
drop function if exists onboarding_status(text);
create or replace function onboarding_status (p_code text, p_session text default null)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_session text := coalesce(nullif(p_session, ''), 'no-session');
  v_emp     employees;
begin
  if (select count(*) from code_attempts
      where session_id = v_session and not success
        and created_at > now() - interval '30 minutes') >= 5
     or (select count(*) from code_attempts
         where not success and created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('found', false, 'locked', true,
      'message', 'Too many wrong codes. Code checks are paused for 30 minutes. Contact People Ops at people@brewtec.de.');
  end if;

  if length(v_code) <> 6 then
    insert into code_attempts (session_id, success) values (v_session, false);
    return jsonb_build_object('found', false,
      'message', 'Please give your 6-character personal code from the welcome email.');
  end if;

  select * into v_emp from employees where access_code = v_code and status = 'approved';

  if v_emp.id is null then
    insert into code_attempts (session_id, success) values (v_session, false);
    return jsonb_build_object('found', false,
      'message', 'No approved onboarding found for this code. Check the code or contact People Ops.');
  end if;

  if v_emp.start_date + 30 < current_date then
    insert into code_attempts (session_id, success) values (v_session, true);
    return jsonb_build_object('found', false, 'expired', true,
      'message', 'This code expired 30 days after your start date. Your manager or People Ops can help with open tasks.');
  end if;

  insert into code_attempts (session_id, success) values (v_session, true);
  return jsonb_build_object(
    'found', true,
    'first_name', v_emp.first_name,
    'department', v_emp.department,
    'site', v_emp.site,
    'start_date', v_emp.start_date,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', t.title, 'owner', t.owner_team, 'due', t.due_date,
               'done', t.completed_at is not null) order by t.due_date)
      from onboarding_tasks t where t.employee_id = v_emp.id), '[]'::jsonb),
    'my_laptop', (select jsonb_build_object('asset_tag', a.asset_tag, 'model', a.model, 'status', a.status)
                  from assets a where a.assigned_to = v_emp.id limit 1),
    'my_account', (select jsonb_build_object('upn', d.upn, 'status', d.status)
                   from directory_accounts d where d.employee_id = v_emp.id)
  );
end;
$$;

-- ---------------------------------------------------------------
-- 4. One call before the AI (workflow 3): cache lookup, circuit breaker, rate limits
-- ---------------------------------------------------------------
create or replace function assistant_prechecks (
  p_key text, p_session text, p_cache_days int default 7, p_breaker_minutes int default 5)
returns table (cached_answer text, cached_sources text, ai_failures int,
               session_questions int, all_questions int)
language plpgsql
set search_path = public, extensions
as $$
begin
  return query
  with hit as (
    update answer_cache c set hits = c.hits + 1, last_hit_at = now()
    where coalesce(p_key, '') <> '' and c.question_key = p_key
      and c.created_at > now() - make_interval(days => greatest(p_cache_days, 0))
    returning c.answer, c.sources
  )
  select (select h.answer from hit h limit 1),
         (select h.sources from hit h limit 1),
         (select count(*) from automation_log l
           where l.workflow = 'wf3' and l.step = 'ai_call' and l.status = 'failed'
             and l.created_at > now() - make_interval(mins => greatest(p_breaker_minutes, 1)))::int,
         (select count(*) from chat_messages m
           where m.session_id = p_session and m.created_at > now() - interval '1 minute')::int,
         (select count(*) from chat_messages m
           where m.created_at > now() - interval '1 minute'
             and coalesce(m.session_id, '') not like 'qc-%')::int;
end;
$$;

-- ---------------------------------------------------------------
-- 5. Data retention (GDPR storage limitation), run daily by workflow 4
-- ---------------------------------------------------------------
drop function if exists purge_expired_data(integer, integer, integer);
create or replace function purge_expired_data (
  p_chat_days int default 90, p_log_days int default 365, p_closed_hire_days int default 180)
returns table (chats int, code_checks int, cached_answers int, logs int, quality_rows int, closed_hires int)
language plpgsql
set search_path = public, extensions
as $$
declare
  n_chats int; n_codes int; n_cache int; n_logs int; n_quality int; n_hires int;
begin
  delete from chat_messages where created_at < now() - make_interval(days => p_chat_days);
  get diagnostics n_chats = row_count;
  delete from code_attempts where created_at < now() - interval '30 days';
  get diagnostics n_codes = row_count;
  delete from answer_cache where created_at < now() - interval '30 days';
  get diagnostics n_cache = row_count;
  delete from automation_log where created_at < now() - make_interval(days => p_log_days);
  get diagnostics n_logs = row_count;
  delete from quality_checks where run_at < now() - make_interval(days => p_log_days);
  get diagnostics n_quality = row_count;
  -- Hires that were sent back or cancelled are not needed after 180 days
  delete from employees where status in ('sent_back', 'cancelled')
    and created_at < now() - make_interval(days => p_closed_hire_days);
  get diagnostics n_hires = row_count;
  return query select n_chats, n_codes, n_cache, n_logs, n_quality, n_hires;
end;
$$;

-- ---------------------------------------------------------------
-- 6. Right to erasure (GDPR Art. 17): removes one person completely
-- Tasks and the planned account are deleted with the employee (on delete cascade).
-- The device goes back to stock. Log rows keep no link to the person.
-- ---------------------------------------------------------------
create or replace function erase_employee (p_employee_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_emp employees;
begin
  select * into v_emp from employees where id = p_employee_id;
  if v_emp.id is null then
    return jsonb_build_object('erased', false, 'message', 'No employee with this id.');
  end if;
  update assets set status = 'in_stock', assigned_to = null, reserved_at = null
    where assigned_to = p_employee_id;
  update automation_log set detail = '[erased]' where employee_id = p_employee_id;
  delete from employees where id = p_employee_id;
  insert into automation_log (workflow, step, status, detail)
    values ('admin', 'erasure', 'ok', 'one employee record erased on request');
  return jsonb_build_object('erased', true);
end;
$$;

-- ---------------------------------------------------------------
-- 7. Security: RLS on, no public access to tables or functions
-- ---------------------------------------------------------------
alter table answer_cache  enable row level security;
alter table code_attempts enable row level security;
revoke all on answer_cache, code_attempts from public;

do $$
declare r record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on answer_cache, code_attempts from anon, authenticated;
  end if;
  for r in select unnest(array[
      'onboarding_status(text, text)',
      'assistant_prechecks(text, text, integer, integer)',
      'purge_expired_data(integer, integer, integer)',
      'erase_employee(uuid)']) as f
  loop
    execute format('revoke execute on function %s from public', r.f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', r.f);
      execute format('grant execute on function %s to service_role', r.f);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
