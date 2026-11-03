-- BrewTec upgrade v7: read-only reporting views for the Grafana business dashboard.
-- Run once in the Supabase SQL editor, after 06_page_tokens.sql.
--
-- Grafana gets its own login (grafana_reader) that can read ONLY the views in the schema
-- "reporting". The views contain counts per day, month, department or team. No names, no e-mail
-- addresses, no access codes, no chat text and nothing from payroll_details.
-- Before running: replace CHANGE-ME-strong-password with your own password (keep it in Bitwarden).

create schema if not exists reporting;

-- Hires per start month and department
create or replace view reporting.hires_by_month as
select date_trunc('month', start_date)::date as month,
       department,
       count(*) filter (where status = 'approved')         as approved,
       count(*) filter (where status = 'pending_approval') as waiting_for_hr,
       count(*) filter (where status in ('sent_back', 'cancelled')) as stopped
from employees
group by 1, 2;

-- Current status of all hires
create or replace view reporting.hire_status as
select status, count(*) as hires
from employees
group by status;

-- Task progress per team
create or replace view reporting.task_progress as
select t.owner_team,
       count(*) filter (where t.completed_at is not null)                              as done,
       count(*) filter (where t.completed_at is null and t.due_date >= current_date)   as open,
       count(*) filter (where t.completed_at is null and t.due_date <  current_date)   as overdue
from onboarding_tasks t
join employees e on e.id = t.employee_id and e.status = 'approved'
group by t.owner_team;

-- Day-1 readiness of approved hires starting in the next 30 days (no names)
create or replace view reporting.day1_readiness as
with h as (
  select e.id, e.start_date, e.department,
         count(*) filter (where t.completed_at is null and t.due_date < current_date)     as overdue,
         count(*) filter (where t.completed_at is null and t.due_date <= e.start_date)   as open_before_start
  from employees e
  join onboarding_tasks t on t.employee_id = e.id
  where e.status = 'approved' and e.start_date between current_date and current_date + 30
  group by e.id, e.start_date, e.department
)
select start_date, department, overdue, open_before_start,
       case when overdue > 0 then 'RED'
            when open_before_start > 0 then 'AMBER'
            else 'GREEN' end as readiness
from h;

-- Employee Payroll Details Form: links sent and forms received per start month
create or replace view reporting.payroll_forms as
select date_trunc('month', e.start_date)::date as month,
       count(*) filter (where t.last_sent_at is not null) as links_sent,
       count(*) filter (where t.completed_at is not null) as received,
       count(*) filter (where t.completed_at is null and t.last_sent_at is not null and e.start_date <= current_date + 3) as missing_close_to_start
from onboarding_tasks t
join employees e on e.id = t.employee_id
where t.task_key = 'pfb_form'
group by 1;

-- Company assistant per day (quality check and test sessions excluded)
create or replace view reporting.chat_daily as
select date_trunc('day', created_at) as day,
       count(*)                                  as questions,
       count(*) filter (where handoff)           as handoffs,
       count(*) filter (where blocked)           as blocked
from chat_messages
where coalesce(session_id, '') not like 'qc-%'
group by 1;

-- Automation steps per day and workflow
create or replace view reporting.automation_daily as
select date_trunc('day', created_at) as day,
       workflow,
       count(*) filter (where status not in ('error', 'failed')) as ok,
       count(*) filter (where status in ('error', 'failed'))     as errors
from automation_log
group by 1, 2;

-- Read-only login for Grafana
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'grafana_reader') then
    create role grafana_reader login password 'CHANGE-ME-strong-password';
  end if;
end $$;

revoke all on schema public from grafana_reader;
grant usage on schema reporting to grafana_reader;
grant select on all tables in schema reporting to grafana_reader;
alter role grafana_reader set search_path = reporting;

-- Check: should list the 7 views
select table_name from information_schema.views where table_schema = 'reporting' order by 1;
