# Workflows

The 13 n8n workflows in [`workflows/`](../workflows). Every Code node's source is also in [`js_nodes/`](../js_nodes), one file per node, named `wf<number>_<node>.js`.

All workflows run in the timezone Europe/Berlin and use workflow 6 as their error workflow.

| # | Workflow | Trigger | Group |
|---|---|---|---|
| 1 | Intake and HR approval | Called by workflow 8, or the fallback form | Onboarding core |
| 2 | Knowledge base ingestion | Every night 02:00, or manual | Company assistant |
| 3 | Company assistant (RAG chatbot) | Chat trigger | Company assistant |
| 4 | Daily onboarding scheduler | Every weekday 07:30, or manual | Onboarding core |
| 5 | Website | Webhooks `/webhook/brewtec` (public) and `/webhook/brewtec/employees` (login) | Company assistant |
| 6 | Error alerts | Any workflow fails | Operations |
| 7 | Weekly answer quality check | Every Monday 07:00, or manual | Operations |
| 8 | Workday integration | Every 5 minutes, or manual | Onboarding core |
| 9 | Mock Workday report API | Webhook, bearer token | Onboarding core |
| 10 | HR portal | Webhooks `/webhook/brewtec/hr...` | Portals |
| 11 | Payroll details secure form | Webhooks `/webhook/brewtec/pfb...` | Portals |
| 12 | Payroll portal | Webhooks `/webhook/brewtec/payroll...` | Portals |
| 13 | Automated chatbot tests | Form with a CSV upload | Testing |

---

## 1. Intake and HR approval

**Triggers:** `From HR system` (called by workflow 8 for every completed Workday hire) and `New hire form` (fallback).

**Steps:**
1. **Check duplicate** in `employees`.
2. **Validate and plan** (Code): department must be one of Engineering, Customer Success, Warehouse and Logistics, Marketing. Site Koeln or Leverkusen. Start at least 14 days away. Proposes the work e-mail and builds the plan of 25 tasks with owner team and due date. Invalid hires are logged and stopped with the reason.
3. **Insert employee** and **Insert task plan**.
4. **Write welcome draft** with the AI, then **Check welcome draft** (Code): no money, salary or contract terms, otherwise a safe template is used.
5. **HR approval**: Gmail send-and-wait. The run pauses until HR clicks Approve or Send back.
6. After approval: **Send welcome email** with the personal code and the assistant link, **Reserve laptop** (`assets`), **Plan account** (`directory_accounts`).
7. **Build team messages** and post to Discord: `#it`, `#facilities`, `#team` (manager).
8. Optional: GitHub org invite for Engineering. Jira tickets for IT and Facilities through the Jira MCP server (switched on with `use_jira`, tested 2 Nov 2026: 4 IT and 3 Facilities tickets for one hire). The ticket list is built by rules in **Build team messages**. The **Jira ticket agent** only calls `jira_create_issue` and may fail without stopping the onboarding. Proof: [IT board](images/jira_it_tickets.png), [Facilities board](images/jira_facilities_tickets.png).
9. **Log onboarding started** in `automation_log`.

**Credentials:** Postgres, Gemini, Gmail OAuth.

## 2. Knowledge base ingestion

**Triggers:** every night at 02:00, or `Run ingestion`.

Checks Notion for changes since the last run and stops if nothing changed (unless run manually). Reads the Notion database and every page's blocks, **Chunk by section** splits by heading, the Supabase vector store saves the chunks with Gemini embeddings (3072 dimensions). Every chunk carries `source` and `run_id` metadata. **Clear knowledge base** deletes the rows of other runs only after the new ones are saved. **Log ingestion** records the chunk count (about 97 chunks from 17 sources) and clears the answer cache, because new documents can change answers.

**Credentials:** Notion, Gemini, Supabase API, Postgres.

## 3. Company assistant (RAG chatbot)

**Trigger:** chat trigger, used by the website (workflow 5).

1. **Input guard** (Code): removes IBAN, tax ID and social security numbers before anything is stored, refuses requests about other people's data, blocks prompt injection in English and German, answers greetings, thanks, off-topic, empty and too long messages (over 1,500 characters) with fixed replies. Rate limits per session.
2. **Pre-checks** and **Route**: answer cache, circuit breaker after AI failures.
3. **Company assistant** (AI agent, OpenRouter model, short chat memory) with two tools:
   - `handbook_search`: vector search in `handbook_documents`
   - `onboarding_status`: the employee's own open tasks, only with their personal code
4. **Answer check** (Code): the answer must cite a source file, the cited file must have been retrieved, every number must appear in that source, no ID numbers, no leaked rules, at most 250 words.
5. If a check fails: **Post to #hr-helpdesk** and tell the user People Ops will answer. Never a guess.
6. **Log chat** in `chat_messages` with personal data masked, deleted after 90 days.

**Memory:** the agent sees the last 8 exchanges of the chat (`Chat memory` node, context window length 8). Verified general answers are cached in `answer_cache` for 7 days (`cache_days` in Config), so the same question gets an answer in about 1 second without the AI. See [Architecture](ARCHITECTURE.md#memory-cache-and-chat-storage).

**Credentials:** OpenRouter, Gemini, Supabase API, Postgres.

## 4. Daily onboarding scheduler

**Triggers:** every weekday at 07:30, or `Run now`.

- **Due auto tasks**: e-mails policies, training and the 30-day survey on their due date and marks them done. Sends the payroll form link about 13 days before the start, and a reminder every 3 days.
- **Overdue tasks**: one digest per team in Discord.
- **Day-1 readiness**: GREEN, AMBER or RED per hire, posted to `#hr-helpdesk`, plus an HR summary e-mail.
- **Health check** of the database and the knowledge base, with an alert if something is missing.
- **Data retention**: deletes old chat logs and expired data.

**Credentials:** Postgres, Gmail.

## 5. Website

Two pages from one workflow:

| Address | For | Login | Content |
|---|---|---|---|
| `/webhook/brewtec` | Everyone (customers, applicants) | None | Public company website: machines, service, sites, contact, an **Employee login** button. No assistant ([`site/public_website.html`](../site/public_website.html)) |
| `/webhook/brewtec/employees` | BrewTec employees | Personal login | The same website plus the employee assistant and the HR portal link ([`site/employee_website.html`](../site/employee_website.html)) |

**Employee area:** **Read login** reads the browser's login (work e-mail and password). With no login, or the same wrong login the browser sent before, **Ask for login** answers 401 and the browser shows its login box. Otherwise **Check login** checks it with `website_login()` in Supabase. Wrong, unknown, locked or disabled logins get **Wrong login**: a page "Wrong e-mail or password" with a Try again button, plus a 15-minute cookie with a short hash of the wrong login, so the browser's remembered wrong login is not counted twice. If the database is unreachable, a friendly 503 page. Accounts: `select website_user_set('name@brewtec.de', 'password', 'Name');`, disable with `website_user_disable('name@brewtec.de')`.

Source chips show which document an answer came from. No execution data is saved.

## 6. Error alerts

**Trigger:** error trigger. Set as the error workflow in workflows 1 to 5 and 7 to 12.

**Build alert** writes the workflow, failed node and error message, posts it to `#agent-dev-ops` in Discord and logs it in `automation_log`.

## 7. Weekly answer quality check

**Triggers:** every Monday at 07:00, or `Run now`.

Asks the assistant 10 fixed golden questions, **Score answers** checks source and key facts, saves the results in `quality_checks`, picks 5 real answers for human review, and posts a report to Discord. Scores stay in `quality_checks` in Supabase, so quality is visible over time.

## 8. Workday integration

**Triggers:** every 5 minutes, or `Run now`.

Calls the Workday `New_Hires` custom report (workflow 9) over HTTP with the bearer token, **Map Workday fields** to the onboarding format, **Claim new workers** in `workday_sync` so no hire is picked up twice, then starts workflow 1 for each one. Hires that fail a rule are recorded as `rejected` with the reason. **Log sync** records each run.

## 9. Mock Workday report API

**Trigger:** webhook at the Workday custom report path `workday/ccx/service/customreport2/brewtec/ISU_Onboarding/New_Hires`.

Answers **401** without a valid bearer token. Otherwise reads `hris_employees` and returns the report in the Workday JSON shape (`Report_Entry`). Only hires with the status `hired` (Successfully Completed) are included.

## 10. HR portal

**Webhooks:** `/brewtec/hr` (page), `/brewtec/hr/hire` (new hire), `/brewtec/hr/status` (complete or withdraw).

Behind an HR Basic Auth login. Shows every Workday hire with its onboarding progress, tasks done, laptop, account and payroll form status (masked IBAN only). The **Hire employee** form uses Workday field names: supervisory organization, business title, manager, location, hire date, hire status. Every form post needs a signed page token (**Issue page token**, **Check page token**). Values are validated and HTML-escaped. Failures alert the agent team.

## 11. Payroll details secure form

**Webhooks:** `/brewtec/pfb?t=...` (form), `/brewtec/pfb/submit`.

**Check link**: the token is compared as a hash, valid 14 days, single use. The new hire enters the personal code from the welcome e-mail (lockout after wrong tries). **Validate form** checks IBAN (mod 97), tax ID and social security number checksums. **Encrypt and save** stores them with `pgp_sym_encrypt` and the Vault key, plus a masked IBAN. No execution data is saved, so the values never appear in n8n.

## 12. Payroll portal

**Webhooks:** `/brewtec/payroll` (list), `/brewtec/payroll/view` (one record), `/brewtec/payroll/export` (mark transferred).

Behind a separate payroll Basic Auth login. The list shows masked IBANs only. **Decrypt and log** opens one record and writes a row in `payroll_access_log` (who, when, view or export, never the values). **Mark transferred** records the DATEV hand-over. Signed page tokens on every action. No execution data is saved.

## 13. Automated chatbot tests

**Trigger:** form `Upload test file` with a CSV file (field `tests`).

**Read test file** → **Config** → **Test cases** parses the CSV (comma or semicolon, with or without BOM) → **Ask the assistant** sends one question every 10 seconds → **Check replies** compares each reply with the expected start, source and facts → **Build report** posts the score to Discord → **Build Excel** creates a workbook with a summary sheet and one sheet per category → **E-mail results**.

Test sessions start with `qc-` so they can be filtered out of the business figures. Rows with the same value in the optional `session` column run in one chat, in file order, to test longer conversations (`chatbot_tests_multi_turn.csv`). See [Testing](TESTING.md).
