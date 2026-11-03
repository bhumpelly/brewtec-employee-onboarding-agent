-- BrewTec GmbH Employee Onboarding Journey Agent
-- Supabase schema. Run the whole file once in the Supabase SQL editor.
-- Safe to run again: tables use IF NOT EXISTS, functions use CREATE OR REPLACE.
-- If you still have the old Bohnenwerk tables, run reset_test_data.sql first.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists employees (
  id                  uuid primary key default gen_random_uuid(),
  access_code         text not null unique
                      default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  first_name          text not null,
  last_name           text not null,
  private_email       text not null,
  work_email          text not null,
  work_email_proposed boolean not null default false,
  department          text not null check (department in
                      ('Engineering', 'Customer Success', 'Warehouse and Logistics', 'Marketing')),
  job_title           text not null,
  manager_name        text not null,
  manager_email       text not null,
  site                text not null check (site in ('Koeln', 'Leverkusen')),
  start_date          date not null,
  notes               text,
  status              text not null default 'pending_approval' check (status in
                      ('pending_approval', 'approved', 'sent_back', 'cancelled')),
  approved_at         timestamptz,
  approved_by         text,
  created_at          timestamptz not null default now()
);

create table if not exists onboarding_tasks (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  task_key     text not null,
  title        text not null,
  owner_team   text not null check (owner_team in ('hr', 'it', 'facilities', 'manager', 'new_hire')),
  due_date     date not null,
  auto         boolean not null default false,
  link_key     text,
  completed_at timestamptz,
  completed_by text,
  created_at   timestamptz not null default now(),
  unique (employee_id, task_key)
);

create table if not exists automation_log (
  id          bigserial primary key,
  employee_id uuid references employees(id) on delete set null,
  workflow    text not null,
  step        text not null,
  status      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create table if not exists chat_messages (
  id           bigserial primary key,
  session_id   text,
  user_message text,
  reply        text,
  sources      text,
  handoff      boolean not null default false,
  blocked      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Knowledge base chunks. 3072 dimensions = models/gemini-embedding-001.
-- No vector index: pgvector indexes stop at 2000 dimensions. About 80 rows need none.
create table if not exists handbook_documents (
  id        bigserial primary key,
  content   text,
  metadata  jsonb,
  embedding vector(3072)
);

create table if not exists assets (
  asset_tag   text primary key,
  profile     text not null check (profile in ('developer', 'standard', 'warehouse')),
  model       text not null,
  status      text not null default 'in_stock' check (status in ('in_stock', 'reserved', 'handed_over')),
  assigned_to uuid references employees(id) on delete set null,
  reserved_at timestamptz
);

create table if not exists directory_accounts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null unique references employees(id) on delete cascade,
  upn          text not null,
  display_name text not null,
  groups       text[] not null default '{}',
  mode         text not null default 'simulated' check (mode in ('simulated', 'graph')),
  status       text not null default 'planned' check (status in ('planned', 'created', 'disabled')),
  created_at   timestamptz not null default now()
);

-- Weekly answer quality check results (workflow 7)
create table if not exists quality_checks (
  id          bigserial primary key,
  run_at      timestamptz not null default now(),
  question_id text not null,
  question    text not null,
  expected    text not null,
  reply       text,
  passed      boolean not null,
  detail      text
);

create index if not exists idx_tasks_due on onboarding_tasks (due_date) where completed_at is null;
create index if not exists idx_employees_start on employees (start_date);
create index if not exists idx_log_employee on automation_log (employee_id);

-- ---------------------------------------------------------------
-- Seed data: 14 devices
-- ---------------------------------------------------------------

insert into assets (asset_tag, profile, model) values
  ('BT-LT-0101', 'developer', 'Dell XPS 15, 32 GB'),
  ('BT-LT-0102', 'developer', 'Dell XPS 15, 32 GB'),
  ('BT-LT-0103', 'developer', 'Dell XPS 15, 32 GB'),
  ('BT-LT-0104', 'developer', 'Dell XPS 15, 32 GB'),
  ('BT-LT-0105', 'developer', 'Dell XPS 15, 32 GB'),
  ('BT-LT-0201', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-LT-0202', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-LT-0203', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-LT-0204', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-LT-0205', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-LT-0206', 'standard',  'Lenovo ThinkPad T14, 16 GB'),
  ('BT-TB-0301', 'warehouse', 'Zebra ET40 rugged tablet'),
  ('BT-TB-0302', 'warehouse', 'Zebra ET40 rugged tablet'),
  ('BT-TB-0303', 'warehouse', 'Zebra ET40 rugged tablet')
on conflict (asset_tag) do nothing;

-- ---------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------

-- Vector search used by the n8n Supabase Vector Store nodes.
create or replace function match_documents (
  query_embedding vector(3072),
  match_count int default null,
  filter jsonb default '{}'
) returns table (id bigint, content text, metadata jsonb, similarity float)
language plpgsql
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  return query
  select hd.id, hd.content, hd.metadata,
         1 - (hd.embedding <=> query_embedding) as similarity
  from handbook_documents hd
  where hd.metadata @> filter
  order by hd.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Reserve one device. Row lock with SKIP LOCKED, so two runs never get the same device.
-- Idempotent: a second call for the same hire returns the device already reserved.
create or replace function reserve_laptop (p_employee_id uuid, p_profile text)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_tag   text;
  v_model text;
begin
  select asset_tag, model into v_tag, v_model
  from assets where assigned_to = p_employee_id limit 1;

  if v_tag is not null then
    return jsonb_build_object('ok', true, 'asset_tag', v_tag, 'model', v_model,
                              'message', 'Already reserved');
  end if;

  select asset_tag, model into v_tag, v_model
  from assets
  where status = 'in_stock' and profile = p_profile
  order by asset_tag
  limit 1
  for update skip locked;

  if v_tag is null then
    insert into automation_log (employee_id, workflow, step, status, detail)
    values (p_employee_id, 'wf1', 'reserve_laptop', 'out_of_stock',
            format('No %s device in stock. IT must order one.', p_profile));
    return jsonb_build_object('ok', false, 'asset_tag', null, 'model', null,
                              'message', format('No %s device in stock. IT must order one.', p_profile));
  end if;

  update assets set status = 'reserved', assigned_to = p_employee_id, reserved_at = now()
  where asset_tag = v_tag;

  update onboarding_tasks set completed_at = now(), completed_by = 'system'
  where employee_id = p_employee_id and task_key = 'laptop_reserve' and completed_at is null;

  insert into automation_log (employee_id, workflow, step, status, detail)
  values (p_employee_id, 'wf1', 'reserve_laptop', 'ok', v_tag);

  return jsonb_build_object('ok', true, 'asset_tag', v_tag, 'model', v_model, 'message', 'Reserved');
end;
$$;

-- Simulated directory account. Real Entra ID creation is phase 2.
create or replace function plan_directory_account (
  p_employee_id uuid, p_upn text, p_display_name text, p_groups text[]
) returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_row directory_accounts;
begin
  insert into directory_accounts (employee_id, upn, display_name, groups, mode, status)
  values (p_employee_id, lower(p_upn), p_display_name, p_groups, 'simulated', 'planned')
  on conflict (employee_id) do update
    set upn = excluded.upn, display_name = excluded.display_name, groups = excluded.groups
  returning * into v_row;

  insert into automation_log (employee_id, workflow, step, status, detail)
  values (p_employee_id, 'wf1', 'plan_account', 'ok', v_row.upn);

  return jsonb_build_object('upn', v_row.upn, 'groups', v_row.groups,
                            'mode', v_row.mode, 'status', v_row.status);
end;
$$;

-- Day-1 readiness for everyone starting on p_date.
create or replace function day1_readiness (p_date date)
returns table (
  employee_id uuid, first_name text, last_name text, department text, site text,
  start_date date, laptop boolean, account boolean, kb_access boolean,
  badge boolean, buddy boolean, missing text, readiness text
)
language sql
stable
set search_path = public, extensions
as $$
  with base as (
    select e.id, e.first_name, e.last_name, e.department, e.site, e.start_date,
      exists (select 1 from assets a where a.assigned_to = e.id) as laptop,
      exists (select 1 from directory_accounts d where d.employee_id = e.id) as account,
      exists (select 1 from directory_accounts d
              where d.employee_id = e.id and 'kb-readers' = any (d.groups)) as kb_access,
      exists (select 1 from onboarding_tasks t
              where t.employee_id = e.id and t.task_key = 'badge' and t.completed_at is not null) as badge,
      exists (select 1 from onboarding_tasks t
              where t.employee_id = e.id and t.task_key = 'buddy' and t.completed_at is not null) as buddy
    from employees e
    where e.status = 'approved' and e.start_date = p_date
  )
  select id, first_name, last_name, department, site, start_date,
         laptop, account, kb_access, badge, buddy,
         nullif(concat_ws(', ',
           case when not laptop then 'laptop' end,
           case when not account then 'account' end,
           case when not kb_access then 'knowledge base access' end,
           case when not badge then 'badge' end,
           case when not buddy then 'buddy' end), '') as missing,
         case
           when not laptop or not account then 'RED'
           when laptop and account and kb_access and badge and buddy then 'GREEN'
           else 'AMBER'
         end as readiness
  from base
  order by last_name;
$$;

-- The only personal data the chatbot can reach. Needs the hire's own code.
-- Works only for approved hires. Returns first name, tasks, device and account. Nothing else.
-- onboarding_status (with lockout and code expiry) is defined in the v3 section at the end.


-- ---------------------------------------------------------------
-- View for People Ops and the metric
-- ---------------------------------------------------------------

drop view if exists onboarding_overview;
create view onboarding_overview as
select e.id, e.first_name, e.last_name, e.department, e.site, e.start_date, e.status,
       count(t.id) as tasks_total,
       count(t.id) filter (where t.completed_at is not null) as tasks_done,
       count(t.id) filter (where t.completed_at is null and t.due_date < current_date) as tasks_overdue,
       (select a.asset_tag from assets a where a.assigned_to = e.id limit 1) as device,
       (select d.upn from directory_accounts d where d.employee_id = e.id) as account
from employees e
left join onboarding_tasks t on t.employee_id = e.id
group by e.id;

-- ---------------------------------------------------------------
-- Security
-- RLS on with no policies: the public anon key sees nothing.
-- n8n connects as the postgres role (Postgres nodes) or service_role (vector store nodes),
-- which bypass RLS.
-- ---------------------------------------------------------------

alter table employees          enable row level security;
alter table onboarding_tasks   enable row level security;
alter table automation_log     enable row level security;
alter table chat_messages      enable row level security;
alter table handbook_documents enable row level security;
alter table assets             enable row level security;
alter table directory_accounts enable row level security;
alter table quality_checks     enable row level security;

-- Nobody can call the functions through the public API. This stops code guessing via RPC.
do $$
declare r record;
begin
  for r in select unnest(array[
      'match_documents(vector, integer, jsonb)',
      'reserve_laptop(uuid, text)',
      'plan_directory_account(uuid, text, text, text[])',
      'day1_readiness(date)']) as f
  loop
    execute format('revoke execute on function %s from public', r.f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', r.f);
      execute format('grant execute on function %s to service_role', r.f);
    end if;
  end loop;
end;
$$;

-- Views ignore RLS by default. security_invoker makes the view follow the RLS of its tables,
-- and the revoke removes the API access Supabase grants by default.
alter view onboarding_overview set (security_invoker = on);
revoke all on onboarding_overview from public;
revoke all on quality_checks from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on onboarding_overview from anon, authenticated;
    revoke all on quality_checks from anon, authenticated;
  end if;
end;
$$;

-- ===============================================================
-- v3: answer cache, access code protection, data retention and erasure
-- ===============================================================

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

-- ===============================================================
-- v4: Workday-style HR system as the source of new hires
-- ===============================================================
--
-- In a real company the hire is created in the HR system (here: Workday) and onboarding reacts
-- to it. The demo has two sides, kept apart like in production:
--   hris_employees  plays the Workday tenant. HR adds hires in the Supabase Table Editor.
--                   Workflow 9 publishes them as a Workday "Report as a Service" (RaaS) JSON API.
--   workday_sync    belongs to the integration (workflow 8). It remembers which workers were
--                   already sent to onboarding, and why a worker was rejected.
-- Workflow 8 only reads Workday through the API, never its table, so going live means changing
-- the report URL and the credential.

create sequence if not exists hris_id_seq start 21001;

-- Mock Workday worker data (the HR system side)
create table if not exists hris_employees (
  hris_id        text primary key default (nextval('hris_id_seq')::text),
  first_name     text not null,
  last_name      text not null,
  private_email  text not null,
  work_email     text,
  department     text not null,
  job_title      text not null,
  manager_name   text not null,
  manager_email  text not null,
  site           text not null,
  start_date     date not null,
  notes          text,
  -- Workday hire business process: offer_signed = In Progress, hired = Successfully Completed,
  -- withdrawn = Rescinded
  status         text not null default 'hired' check (status in ('offer_signed', 'hired', 'withdrawn')),
  created_at     timestamptz not null default now()
);

-- Integration state (the onboarding side)
create table if not exists workday_sync (
  worker_id    text primary key,
  sync_status  text not null check (sync_status in ('sent_to_onboarding', 'rejected')),
  sync_note    text,
  synced_at    timestamptz not null default now()
);

alter table employees add column if not exists hris_id text;
create unique index if not exists idx_employees_hris_id on employees (hris_id) where hris_id is not null;

-- Overview for People Ops: every Workday hire and where it is in onboarding
drop view if exists hris_sync_overview;
create or replace view workday_sync_overview as
select h.hris_id as worker_id, h.first_name, h.last_name, h.department, h.start_date,
       case h.status when 'hired' then 'Successfully Completed'
                     when 'offer_signed' then 'In Progress' else 'Rescinded' end as hire_process,
       coalesce(s.sync_status, 'not picked up') as sync_status, s.sync_note, s.synced_at,
       e.status as onboarding_status, e.approved_at
from hris_employees h
left join workday_sync s on s.worker_id = h.hris_id
left join employees e on e.hris_id = h.hris_id
order by h.created_at desc;

-- Security: same rules as the other tables
alter table hris_employees enable row level security;
alter table workday_sync enable row level security;
alter view workday_sync_overview set (security_invoker = on);
revoke all on hris_employees, workday_sync, workday_sync_overview from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on hris_employees, workday_sync, workday_sync_overview from anon, authenticated;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ===============================================================
-- v5: secure Employee Payroll Details Form (encrypted bank, tax and social security data)
-- ===============================================================
--
-- Design
--   * The onboarding agent, the AI, the logs, Discord and LangSmith never hold these values.
--   * The new hire enters them only in the self-service form (workflow 11), opened with a personal,
--     single-use link plus their personal code.
--   * IBAN, tax ID and social security number are encrypted inside the database with pgcrypto
--     (AES-256). The key lives in Supabase Vault, not in a table, not in n8n and not in any export.
--   * Only the payroll portal (workflow 12, separate login) decrypts, and every view is logged.
--   * HR and the onboarding agent see only "received" and a masked IBAN (DE89 •••• 3000).
--
-- One-time key setup (run once, the key is generated inside the database and never shown):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pfb_encryption_key',
--                              'Encrypts IBAN, tax ID and social security number');

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

-- Personal links to the form. Only a SHA-256 hash of the link token is stored.
create table if not exists pfb_requests (
  id               bigserial primary key,
  employee_id      uuid not null references employees(id) on delete cascade,
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  failed_attempts  int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_pfb_requests_employee on pfb_requests (employee_id);

-- Encrypted payroll data, one row per employee. Kept apart from the employees table.
create table if not exists payroll_details (
  employee_id     uuid primary key references employees(id) on delete cascade,
  iban_enc        bytea not null,
  tax_id_enc      bytea not null,
  sv_number_enc   bytea not null,
  health_insurer  text not null,
  tax_class       text not null,
  iban_masked     text not null,          -- for HR: country code, check digits and last 4 only
  key_name        text not null default 'pfb_encryption_key',
  submitted_at    timestamptz not null default now(),
  exported_at     timestamptz,
  exported_by     text
);

-- Who looked at or exported payroll data, and when. Never the values themselves.
create table if not exists payroll_access_log (
  id           bigserial primary key,
  employee_id  uuid references employees(id) on delete set null,
  action       text not null check (action in ('view', 'export')),
  actor        text not null,
  created_at   timestamptz not null default now()
);

-- Reminder support: when the agent last e-mailed the form link
alter table onboarding_tasks add column if not exists last_sent_at timestamptz;

-- ---------------------------------------------------------------
-- Key access (Supabase Vault)
-- ---------------------------------------------------------------
create or replace function pfb_key ()
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'pfb_encryption_key' limit 1;
  if v_key is null or length(v_key) < 32 then
    raise exception 'Encryption key pfb_encryption_key is missing in Supabase Vault. See 05_payroll.sql.';
  end if;
  return v_key;
end;
$$;

-- ---------------------------------------------------------------
-- Personal links
-- ---------------------------------------------------------------

-- New single-use link for one employee. Earlier unused links stop working.
-- Returns null when the form was already submitted (no link needed).
create or replace function pfb_create_link (p_employee_id uuid, p_days int default 14)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare v_token text;
begin
  if exists (select 1 from payroll_details where employee_id = p_employee_id) then
    return null;
  end if;
  update pfb_requests set expires_at = least(expires_at, now())
    where employee_id = p_employee_id and used_at is null;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into pfb_requests (employee_id, token_hash, expires_at)
    values (p_employee_id, encode(digest(v_token, 'sha256'), 'hex'), now() + make_interval(days => greatest(p_days, 1)));
  return v_token;
end;
$$;

-- Is this link usable? Returns only the first name, nothing else about the person.
create or replace function pfb_open (p_token text)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare r record;
begin
  select q.*, e.first_name into r
  from pfb_requests q join employees e on e.id = q.employee_id
  where q.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if r.id is null then return jsonb_build_object('valid', false, 'reason', 'unknown'); end if;
  if r.used_at is not null then return jsonb_build_object('valid', false, 'reason', 'used'); end if;
  if r.failed_attempts >= 5 then return jsonb_build_object('valid', false, 'reason', 'locked'); end if;
  if r.expires_at <= now() then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  return jsonb_build_object('valid', true, 'first_name', r.first_name);
end;
$$;

-- Stores the form: checks link and personal code, encrypts, completes the onboarding task.
create or replace function pfb_submit (p_token text, p_code text, p_iban text, p_tax_id text,
                                       p_sv_number text, p_health_insurer text, p_tax_class text)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  r      record;
  v_key  text;
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_tax  text := regexp_replace(coalesce(p_tax_id, ''), '\s', '', 'g');
  v_sv   text := upper(regexp_replace(coalesce(p_sv_number, ''), '\s', '', 'g'));
begin
  select q.*, e.access_code, e.first_name into r
  from pfb_requests q join employees e on e.id = q.employee_id
  where q.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update of q;

  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if r.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if r.failed_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if r.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) <> r.access_code then
    update pfb_requests set failed_attempts = failed_attempts + 1 where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_code', 'attempts_left', greatest(4 - r.failed_attempts, 0));
  end if;

  -- Second line of defence: formats are checked again here, whatever the form sent
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' or v_tax !~ '^[1-9][0-9]{10}$'
     or v_sv !~ '^[0-9]{8}[A-Z][0-9]{3}$' or coalesce(trim(p_health_insurer), '') = ''
     or coalesce(p_tax_class, '') !~ '^[1-6]$' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;

  v_key := pfb_key();
  insert into payroll_details (employee_id, iban_enc, tax_id_enc, sv_number_enc, health_insurer, tax_class, iban_masked)
  values (r.employee_id,
          pgp_sym_encrypt(v_iban, v_key, 'cipher-algo=aes256'),
          pgp_sym_encrypt(v_tax, v_key, 'cipher-algo=aes256'),
          pgp_sym_encrypt(v_sv, v_key, 'cipher-algo=aes256'),
          left(trim(p_health_insurer), 80), p_tax_class,
          left(v_iban, 4) || ' •••• ' || right(v_iban, 4))
  on conflict (employee_id) do update
    set iban_enc = excluded.iban_enc, tax_id_enc = excluded.tax_id_enc, sv_number_enc = excluded.sv_number_enc,
        health_insurer = excluded.health_insurer, tax_class = excluded.tax_class,
        iban_masked = excluded.iban_masked, submitted_at = now(), exported_at = null, exported_by = null;

  update pfb_requests set used_at = now() where id = r.id;
  update onboarding_tasks set completed_at = now(), completed_by = 'new_hire'
    where employee_id = r.employee_id and task_key = 'pfb_form' and completed_at is null;
  insert into automation_log (employee_id, workflow, step, status, detail)
    values (r.employee_id, 'wf11', 'pfb_submitted', 'ok', 'Employee Payroll Details Form received and encrypted');
  return jsonb_build_object('ok', true, 'first_name', r.first_name);
end;
$$;

-- ---------------------------------------------------------------
-- Payroll portal
-- ---------------------------------------------------------------

-- Overview without decryption
create or replace function payroll_list ()
returns table (employee_id uuid, worker_id text, first_name text, last_name text, department text,
               start_date date, status text, pfb_status text, iban_masked text, health_insurer text,
               submitted_at timestamptz, exported_at timestamptz, exported_by text)
language sql
stable
set search_path = public, extensions
as $$
  select e.id, e.hris_id, e.first_name, e.last_name, e.department, e.start_date, e.status,
         case when p.employee_id is not null then 'received'
              when t.last_sent_at is not null then 'link sent'
              else 'not sent yet' end,
         p.iban_masked, p.health_insurer, p.submitted_at, p.exported_at, p.exported_by
  from employees e
  left join payroll_details p on p.employee_id = e.id
  left join onboarding_tasks t on t.employee_id = e.id and t.task_key = 'pfb_form'
  where e.status = 'approved'
  order by (p.employee_id is not null and p.exported_at is null) desc, e.start_date;
$$;

-- Decrypts one record for payroll and logs the access
create or replace function payroll_view (p_employee_id uuid, p_actor text)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare v_key text; v jsonb;
begin
  v_key := pfb_key();
  select jsonb_build_object(
           'employee_id', e.id, 'worker_id', e.hris_id, 'name', e.first_name || ' ' || e.last_name,
           'department', e.department, 'start_date', e.start_date,
           'iban', pgp_sym_decrypt(p.iban_enc, v_key),
           'tax_id', pgp_sym_decrypt(p.tax_id_enc, v_key),
           'sv_number', pgp_sym_decrypt(p.sv_number_enc, v_key),
           'health_insurer', p.health_insurer, 'tax_class', p.tax_class,
           'submitted_at', p.submitted_at, 'exported_at', p.exported_at, 'exported_by', p.exported_by)
    into v
  from payroll_details p join employees e on e.id = p.employee_id
  where p.employee_id = p_employee_id;
  if v is null then return jsonb_build_object('found', false); end if;
  insert into payroll_access_log (employee_id, action, actor) values (p_employee_id, 'view', left(coalesce(p_actor, 'unknown'), 80));
  return v || jsonb_build_object('found', true);
end;
$$;

create or replace function payroll_mark_exported (p_employee_id uuid, p_actor text)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
begin
  update payroll_details set exported_at = now(), exported_by = left(coalesce(p_actor, 'unknown'), 80)
    where employee_id = p_employee_id;
  if not found then return jsonb_build_object('ok', false); end if;
  insert into payroll_access_log (employee_id, action, actor) values (p_employee_id, 'export', left(coalesce(p_actor, 'unknown'), 80));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------
-- Retention: old form links are deleted after 30 days. Payroll data itself follows the legal
-- retention for payroll records and is removed with the employee (erasure or closed hire).
-- ---------------------------------------------------------------
drop function if exists purge_expired_data(integer, integer, integer);
create or replace function purge_expired_data (
  p_chat_days int default 90, p_log_days int default 365, p_closed_hire_days int default 180)
returns table (chats int, code_checks int, cached_answers int, logs int, quality_rows int,
               closed_hires int, form_links int)
language plpgsql
set search_path = public, extensions
as $$
declare
  n_chats int; n_codes int; n_cache int; n_logs int; n_quality int; n_hires int; n_links int;
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
  delete from employees where status in ('sent_back', 'cancelled')
    and created_at < now() - make_interval(days => p_closed_hire_days);
  get diagnostics n_hires = row_count;
  delete from pfb_requests where created_at < now() - interval '30 days';
  get diagnostics n_links = row_count;
  return query select n_chats, n_codes, n_cache, n_logs, n_quality, n_hires, n_links;
end;
$$;

-- ---------------------------------------------------------------
-- Security: RLS on, no public access to tables or functions
-- ---------------------------------------------------------------
alter table pfb_requests       enable row level security;
alter table payroll_details    enable row level security;
alter table payroll_access_log enable row level security;
revoke all on pfb_requests, payroll_details, payroll_access_log from public;

do $$
declare r record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on pfb_requests, payroll_details, payroll_access_log from anon, authenticated;
  end if;
  for r in select unnest(array[
      'pfb_key()',
      'pfb_create_link(uuid, integer)',
      'pfb_open(text)',
      'pfb_submit(text, text, text, text, text, text, text)',
      'payroll_list()',
      'payroll_view(uuid, text)',
      'payroll_mark_exported(uuid, text)',
      'purge_expired_data(integer, integer, integer)']) as f
  loop
    execute format('revoke execute on function %s from public', r.f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', r.f);
      execute format('grant execute on function %s to service_role', r.f);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- Page tokens for the HR portal and the payroll portal (workflows 10 and 12)
-- n8n serves webhook pages in a browser sandbox, so a form on those pages has no origin and the
-- browser cannot prove that a click came from the portal itself. Instead, every portal page
-- carries a short-lived token signed with a key derived from the Vault key. A button press is
-- accepted only with a valid token for that portal, and another website cannot obtain one.
-- ---------------------------------------------------------------
create or replace function basic_auth_user (p_header text)
returns text
language plpgsql
immutable
as $$
begin
  return coalesce(nullif(left(regexp_replace(split_part(convert_from(decode(split_part(coalesce(p_header, ''), ' ', 2), 'base64'), 'UTF8'), ':', 1),
                             '[^A-Za-z0-9._@-]', '', 'g'), 60), ''), 'unknown');
exception when others then
  return 'unknown';
end;
$$;

create or replace function portal_key ()
returns text
language sql
stable
set search_path = public, extensions
as $$ select encode(digest('brewtec-portal-page-token:' || pfb_key(), 'sha256'), 'hex'); $$;

create or replace function portal_token (p_scope text, p_actor text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_actor   text := coalesce(nullif(regexp_replace(coalesce(p_actor, ''), '[^A-Za-z0-9._@-]', '', 'g'), ''), 'unknown');
  v_payload text := p_scope || '~' || left(v_actor, 60) || '~' || floor(extract(epoch from now()))::bigint;
begin
  return v_payload || '~' || encode(hmac(v_payload, portal_key(), 'sha256'), 'hex');
end;
$$;

create or replace function portal_token_check (p_scope text, p_token text, p_max_minutes int default 120)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_token, ''), '~');
  v_age   numeric;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 4 or v_parts[1] is distinct from p_scope
     or coalesce(v_parts[3], '') !~ '^[0-9]{9,12}$' or coalesce(v_parts[4], '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  if encode(hmac(v_parts[1] || '~' || v_parts[2] || '~' || v_parts[3], portal_key(), 'sha256'), 'hex') <> v_parts[4] then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  v_age := extract(epoch from now()) - v_parts[3]::bigint;
  if v_age < -60 or v_age > p_max_minutes * 60 then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  return jsonb_build_object('ok', true, 'actor', v_parts[2]);
end;
$$;

do $$
declare r record;
begin
  for r in select unnest(array[
      'basic_auth_user(text)', 'portal_key()', 'portal_token(text, text)',
      'portal_token_check(text, text, integer)']) as f
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
