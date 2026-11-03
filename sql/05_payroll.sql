-- Upgrade v5: secure Employee Payroll Details Form (bank, tax and social security data).
-- Run once in the Supabase SQL Editor after v4. Safe to run again.
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
