-- Upgrade v4: Workday-style HR system as the source of new hires.
-- Run once in the Supabase SQL Editor after the v3 upgrade. Safe to run again.
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
