-- BrewTec upgrade v6: signed page tokens for the HR portal (10) and the payroll portal (12)
-- Run once in the Supabase SQL editor, after 05_payroll.sql and after the Vault key exists.
-- Safe to run again.

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

-- Check: should return ok = true
select portal_token_check('hr', portal_token('hr', 'hr')) as check_result;
