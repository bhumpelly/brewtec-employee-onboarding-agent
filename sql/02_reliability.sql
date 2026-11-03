-- Upgrade for the reliability layer. Run once in the Supabase SQL Editor.
-- Adds the table for the weekly quality check (workflow 7). Existing data is not touched.
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
alter table quality_checks enable row level security;
revoke all on quality_checks from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on quality_checks from anon, authenticated;
  end if;
end;
$$;
