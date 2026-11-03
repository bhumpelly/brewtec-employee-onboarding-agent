-- Removes all onboarding agent tables, functions and data.
-- Only run this if you want a clean start, for example to remove the old Bohnenwerk tables.
-- Then run 01_schema.sql again.

drop view if exists onboarding_overview;
drop function if exists portal_token_check(text, text, integer);
drop function if exists portal_token(text, text);
drop function if exists portal_key();
drop function if exists basic_auth_user(text);
drop function if exists pfb_key();
drop function if exists pfb_create_link(uuid, integer);
drop function if exists pfb_open(text);
drop function if exists pfb_submit(text, text, text, text, text, text, text);
drop function if exists payroll_list();
drop function if exists payroll_view(uuid, text);
drop function if exists payroll_mark_exported(uuid, text);
drop table if exists payroll_access_log;
drop table if exists payroll_details;
drop table if exists pfb_requests;
drop view if exists hris_sync_overview;
drop view if exists workday_sync_overview;
drop function if exists onboarding_status(text);
drop function if exists onboarding_status(text, text);
drop function if exists assistant_prechecks(text, text, integer, integer);
drop function if exists purge_expired_data(integer, integer, integer);
drop function if exists erase_employee(uuid);
drop function if exists day1_readiness(date);
drop function if exists plan_directory_account(uuid, text, text, text[]);
drop function if exists reserve_laptop(uuid, text);
drop function if exists match_documents(extensions.vector, integer, jsonb);
drop table if exists workday_sync;
drop table if exists hris_employees;
drop sequence if exists hris_id_seq;
drop table if exists answer_cache;
drop table if exists code_attempts;
drop table if exists quality_checks;
drop table if exists directory_accounts;
drop table if exists assets;
drop table if exists handbook_documents;
drop table if exists chat_messages;
drop table if exists automation_log;
drop table if exists onboarding_tasks;
drop table if exists employees;
