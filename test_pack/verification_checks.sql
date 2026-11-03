-- BrewTec onboarding agent: verification checks
-- Run one block at a time in the Supabase SQL Editor (select the block, then Run).
-- Each block says what a good result looks like.


-- =====================================================================
-- A. KNOWLEDGE BASE
-- =====================================================================

-- A1. Chunks per document. Good: 17 files, every file at least 1 chunk.
select metadata->>'doc_id' as doc_id, metadata->>'source' as file, count(*) as chunks
from handbook_documents
group by 1, 2
order by 1;

-- A2. Exact source file names, to compare with kb_questions.csv
select distinct metadata->>'source' as file from handbook_documents order by 1;

-- A3. Did the nightly update pick up the Notion test line? Good: 1 row.
select metadata->>'source' as file, metadata->>'section' as section
from handbook_documents
where content ilike '%Testing trigger scheduler%';

-- A4. Ingestion history. Good: one row per rebuild, the newest around 02:00 after a Notion edit.
select created_at at time zone 'Europe/Berlin' as berlin_time, detail
from automation_log
where workflow = 'wf2'
order by created_at desc
limit 10;


-- =====================================================================
-- B. CHATBOT RESULTS (for kb_questions.csv and TC14 to TC26)
-- =====================================================================

-- B1. Last 30 chat messages with source and hand-off flag
select created_at at time zone 'Europe/Berlin' as berlin_time,
       left(user_message, 70) as question,
       sources, handoff, blocked,
       left(reply, 90) as reply_start
from chat_messages
order by id desc
limit 30;

-- B2. Guardrail score for the 20 knowledge base questions.
-- Run the 20 questions in one fresh session, then count. Good: answered_with_source + handed_off >= 18
-- (a hand-off only counts as correct for KB19 and KB20, check those two by hand).
select count(*) filter (where not handoff and not blocked and sources not in ('', 'small talk')) as answered_with_source,
       count(*) filter (where handoff) as handed_off,
       count(*) filter (where blocked) as blocked,
       count(*) as total
from (select * from chat_messages order by id desc limit 20) last20;


-- =====================================================================
-- C. GUARDRAILS
-- =====================================================================

-- C1. Approval gate. Good: 0.
-- Welcome emails marked sent without an earlier recorded HR approval.
select count(*) as sent_without_approval
from onboarding_tasks t
where t.task_key = 'welcome_email'
  and t.completed_at is not null
  and not exists (
    select 1 from automation_log l
    where l.employee_id = t.employee_id
      and l.step = 'hr_approval' and l.status = 'approved'
      and l.created_at <= t.completed_at);

-- C2. Every approved hire has its approval recorded. Good: approvals = approved_hires.
select (select count(*) from employees where status = 'approved') as approved_hires,
       (select count(distinct employee_id) from automation_log
        where step = 'hr_approval' and status = 'approved') as approvals;

-- C3. Sent back requests never got anything. Good: 0 rows.
select e.first_name, e.last_name
from employees e
where e.status = 'sent_back'
  and (exists (select 1 from assets a where a.assigned_to = e.id)
       or exists (select 1 from onboarding_tasks t where t.employee_id = e.id
                  and t.task_key = 'welcome_email' and t.completed_at is not null));

-- C4. Personal identifiers stored anywhere. Good: 0 in every column.
select
  (select count(*) from chat_messages where user_message ~* '[A-Z]{2}[0-9]{2}( ?[A-Z0-9]{4}){3,7}'
                                          or user_message ~ '(^|[^0-9])[0-9]{2} ?[0-9]{3} ?[0-9]{3} ?[0-9]{3}([^0-9]|$)'
                                          or user_message ~* '[0-9]{2} ?[0-9]{6} ?[A-Z] ?[0-9]{3}') as chat_questions,
  (select count(*) from chat_messages where reply ~* 'DE[0-9]{2}( ?[0-9]{4}){4}'
                                          or reply ~ '(^|[^0-9])[0-9]{2} ?[0-9]{3} ?[0-9]{3} ?[0-9]{3}([^0-9]|$)') as chat_replies,
  (select count(*) from employees where coalesce(notes, '') ~ '(^|[^0-9])[0-9]{2} ?[0-9]{3} ?[0-9]{3} ?[0-9]{3}([^0-9]|$)'
                                     or coalesce(notes, '') ~* '[A-Z]{2}[0-9]{2}( ?[A-Z0-9]{4}){3,7}') as hire_notes,
  (select count(*) from chat_messages where user_message = '[removed: personal data]') as removed_messages_for_info;

-- C5. Discord data minimisation is visible in the posts themselves (first name and last initial).


-- =====================================================================
-- D. HIRES, TASKS, DEVICES
-- =====================================================================

-- D1. Overview of all hires
select first_name, last_name, department, site, start_date, status,
       tasks_total, tasks_done, tasks_overdue, device, account
from onboarding_overview
order by start_date, last_name;

-- D2. Personal codes of the approved test hires (for TC21)
select first_name, last_name, access_code from employees where status = 'approved' order by created_at;

-- D3. Device stock
select profile, status, count(*) from assets group by 1, 2 order by 1, 2;

-- D4. Audit trail of one hire, in order (change the name)
select l.created_at at time zone 'Europe/Berlin' as berlin_time, l.workflow, l.step, l.status, l.detail
from automation_log l
join employees e on e.id = l.employee_id
where e.first_name = 'Jonas'
order by l.created_at;


-- =====================================================================
-- E. METRIC: system side of the 5 test hires
-- People Ops minutes are timed by hand (time_saved_hires.csv).
-- This shows how long each hire waited for approval and what the system did by itself.
-- =====================================================================

-- E1. Per hire: submitted, approved, minutes waiting for HR, automatic steps done
select e.first_name || ' ' || left(e.last_name, 1) || '.' as hire,
       to_char(e.created_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as submitted,
       to_char(e.approved_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as approved,
       round(extract(epoch from (e.approved_at - e.created_at)) / 60, 1) as minutes_until_approval,
       (select count(*) from automation_log l where l.employee_id = e.id) as automatic_steps_logged,
       (select count(*) from onboarding_tasks t where t.employee_id = e.id and t.completed_by in ('system', 'wf1', 'wf4')) as tasks_done_by_system
from employees e
where e.status = 'approved'
order by e.created_at;


-- =====================================================================
-- F. SCHEDULER AND READINESS (TC29, TC30)
-- =====================================================================

-- F1. Make Jonas's Employee Payroll Details Form due yesterday, then click Run now in workflow 4
update onboarding_tasks set due_date = current_date - 1
where task_key = 'pfb_form'
  and employee_id = (select id from employees where first_name = 'Jonas' and status = 'approved' limit 1);

-- F2. Make two manual tasks overdue, for the overdue digest
update onboarding_tasks set due_date = current_date - 1
where task_key in ('contract_check', 'vpn_access')
  and employee_id = (select id from employees where first_name = 'Jonas' and status = 'approved' limit 1);

-- F3. Days until Jonas starts. Put this number into readiness_days_ahead in workflow 4 Config.
select start_date, start_date - current_date as readiness_days_ahead
from employees where first_name = 'Jonas' and status = 'approved' limit 1;

-- F4. Readiness preview without running the workflow (change the date)
select first_name, last_name, readiness, missing from day1_readiness('2026-11-09');

-- F5. Turn Jonas GREEN for the demo: badge and buddy done
update onboarding_tasks set completed_at = now(), completed_by = 'facilities'
where task_key in ('badge', 'buddy')
  and employee_id = (select id from employees where first_name = 'Jonas' and status = 'approved' limit 1);


-- =====================================================================
-- G. RESET TEST DATA (only when you want to start the tests again)
-- Removes all hires, tasks, logs and chats. Keeps the knowledge base and the 14 devices.
-- =====================================================================

-- G1. Run all four lines together
-- delete from employees;
-- update assets set status = 'in_stock', assigned_to = null, reserved_at = null;
-- delete from chat_messages;
-- delete from automation_log where workflow <> 'wf2';
-- delete from answer_cache;
-- delete from code_attempts;


-- =====================================================================
-- H. PRIVACY, CACHE AND PROTECTION (v3, tests R16 to R30)
-- =====================================================================

-- H1. Answer cache: what is cached and how often it was reused
select question, sources, hits, created_at, last_hit_at
from answer_cache order by last_hit_at desc nulls last;

-- H2. Cache hit rate over the last 7 days (share of questions answered from the cache)
select count(*) filter (where sources like 'cache:%') as from_cache,
       count(*) filter (where sources not in ('small talk', 'empty', 'too_long', 'pii', 'manipulation')) as answered,
       round(100.0 * count(*) filter (where sources like 'cache:%')
             / nullif(count(*) filter (where sources not in ('small talk', 'empty', 'too_long', 'pii', 'manipulation')), 0)) as hit_rate_pct
from chat_messages where created_at > now() - interval '7 days';

-- H3. What the chat log really stores (masked questions, personal replies replaced)
select created_at, user_message, left(reply, 80) as reply, sources, handoff, blocked
from chat_messages order by created_at desc limit 20;

-- H4. Code attempts: no codes are stored, only session and outcome
select session_id, success, created_at from code_attempts order by created_at desc limit 20;

-- H5. AI failures by type, with the reference number shown to the employee
select created_at, split_part(detail, ' | ', 1) as type, split_part(detail, ' | ', 2) as reference
from automation_log where workflow = 'wf3' and step = 'ai_call' and status = 'failed'
order by created_at desc limit 20;

-- H6. Replies without the AI, by reason
select sources, count(*) from chat_messages
where sources in ('off_topic', 'breaker', 'session_limit', 'busy') or sources like 'ai unavailable%'
group by sources order by 2 desc;

-- H7. Data retention runs
select created_at, detail from automation_log where step = 'retention' order by created_at desc limit 5;

-- H8. Right to erasure for one person (GDPR Art. 17). Replace the id first.
-- select erase_employee('00000000-0000-0000-0000-000000000000');


-- =====================================================================
-- I. WORKDAY (mock tenant workflow 9, integration workflow 8, tests TC31 to TC36)
-- In the demo the Supabase Table Editor for hris_employees plays Workday.
-- status: hired = Successfully Completed, offer_signed = In Progress, withdrawn = Rescinded
-- =====================================================================

-- I1. HR completes the hire of Lena in Workday. Use your own plus address.
insert into hris_employees (first_name, last_name, private_email, department, job_title,
                            manager_name, manager_email, site, start_date, status)
values ('Lena', 'Schmidt', 'YOURNAME+lena@gmail.com', 'Marketing', 'Marketing Manager',
        'Mia Wagner', 'mia.wagner@brewtec.de', 'Koeln', current_date + 21, 'hired');

-- I2. Hire process still In Progress: must NOT start onboarding
insert into hris_employees (first_name, last_name, private_email, department, job_title,
                            manager_name, manager_email, site, start_date, status)
values ('Tom', 'Weber', 'YOURNAME+tom@gmail.com', 'Engineering', 'Backend Developer',
        'Max Klein', 'max.klein@brewtec.de', 'Leverkusen', current_date + 30, 'offer_signed');
-- later: update hris_employees set status = 'hired' where first_name = 'Tom';

-- I3. A hire the rules reject (department not in the onboarding plan)
insert into hris_employees (first_name, last_name, private_email, department, job_title,
                            manager_name, manager_email, site, start_date, status)
values ('Ida', 'Berg', 'YOURNAME+ida@gmail.com', 'Finance', 'Accountant',
        'Max Klein', 'max.klein@brewtec.de', 'Koeln', current_date + 30, 'hired');

-- I4. Where is every Workday hire in onboarding?
select * from workday_sync_overview;

-- I5. Integration runs
select created_at, detail from automation_log where workflow = 'wf8' order by created_at desc limit 10;

-- I6. Retry a rejected worker after HR fixed the data (replace the id)
-- delete from workday_sync where worker_id = '21003';

-- I7. Reset the Workday test data
-- delete from workday_sync; delete from hris_employees;


-- =====================================================================
-- J. PERSONALFRAGEBOGEN AND PAYROLL (workflows 11 and 12, tests TC44 to TC53)
-- =====================================================================

-- J1. One-time key setup (only once, before the first form is submitted)
-- select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pfb_encryption_key',
--                            'Encrypts IBAN, tax ID and social security number');

-- J2. Make the form e-mail due for one hire now (replace the first name), then run WF4 Run now
-- update onboarding_tasks set due_date = current_date, last_sent_at = null
-- where task_key = 'pfb_form'
--   and employee_id = (select id from employees where first_name = 'Lena' and status = 'approved' limit 1);

-- J3. What is really stored: unreadable bytes plus a masked IBAN
select e.first_name, left(encode(p.iban_enc, 'hex'), 32) || '...' as iban_encrypted,
       left(encode(p.tax_id_enc, 'hex'), 32) || '...' as tax_id_encrypted,
       p.iban_masked, p.health_insurer, p.submitted_at, p.exported_at, p.exported_by
from payroll_details p join employees e on e.id = p.employee_id;

-- J4. Form status for every approved hire (what payroll sees in the list, no decryption)
select first_name, last_name, pfb_status, iban_masked, exported_at from payroll_list();

-- J5. Who opened or transferred payroll data
select l.created_at, e.first_name, l.action, l.actor
from payroll_access_log l left join employees e on e.id = l.employee_id
order by l.created_at desc limit 20;

-- J6. Form links: only hashes, single use, expiry, failed codes
select e.first_name, left(q.token_hash, 12) || '...' as token_hash, q.expires_at, q.used_at, q.failed_attempts
from pfb_requests q join employees e on e.id = q.employee_id order by q.created_at desc limit 20;

-- J7. Proof that logs and chats hold no payroll values (expect 0 for a test IBAN you used)
select count(*) from automation_log where detail ilike '%3704 0044%' or detail ilike '%37040044%';
