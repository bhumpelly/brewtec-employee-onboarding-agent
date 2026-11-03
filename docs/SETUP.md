# Setup guide

Step by step from an empty Supabase project to the running agent with 13 workflows. For what each part does, see the [README](../README.md), [Architecture](ARCHITECTURE.md) and [Workflows](WORKFLOWS.md).

Design principle: the AI only writes text. Rules in Code nodes decide. HR approves before anything leaves the company.

The sections follow the order the project was built in. Sections 1 to 3 give a working core (workflows 1 to 4). Sections 5 to 12 add the website, reliability, privacy, Workday, the portals, the automated tests and monitoring. Section 4 (Jira MCP) is optional.

## Setup, in this order

### 1. Supabase

1. If the old Bohnenwerk tables exist, run `reset_test_data.sql` first. This deletes their data.
2. Open SQL editor, paste `01_schema.sql`, click Run.
3. Check Table editor: 7 tables, `assets` has 14 rows.

### 2. Credentials in n8n

| Credential | Used by | Notes |
| --- | --- | --- |
| Postgres | all Postgres nodes, onboarding_status tool | Supabase Session pooler host, port 5432, user `postgres.<project-ref>`, SSL on. Docker has no IPv6, so the direct host does not work |
| Supabase API | vector store nodes in WF2 and WF3 | Project URL and the service_role key |
| Google Gemini (PaLM) API | chat models and embeddings | One key for all Gemini nodes |
| Notion API | 2 HTTP nodes in WF2 | Integration n8n BrewTec KB with Read content |
| Gmail OAuth2 | HR approval, welcome email, WF4 emails | Reuse the working OAuth client |
| GitHub API | GitHub org invite | Optional. Leave github_org empty to skip |

### 3. Import and configure

Import in this order: workflow 2, 3, 1, 4. After each import open every node with a red warning and pick the credential.

**Workflow 2**: paste the Notion database link into Config. Execute workflow. Publish it to switch on the nightly update: at 02:00 it checks Notion for pages edited since the last ingestion and rebuilds only if something changed. Expect about 80 rows in `handbook_documents` and a `wf2 ingestion` row in `automation_log`.

**Workflow 3**: set `discord_hr_webhook` in Config. Publish. Open the chat trigger, copy the Chat URL. Paste it into `site/chat_assistant.html`. In Config of workflows 1 and 4, `chat_url` is the employee area `http://localhost:5678/webhook/brewtec/employees` (or the tunnel address).

**Workflow 1**: fill Config. `hr_inbox` must be a real inbox, for example your Gmail with plus addressing (`you+hr@gmail.com`). Paste the three Discord webhooks. Keep `use_jira` on `false` until the Jira MCP server runs (step 4). Publish.

**Workflow 4**: fill Config. For the demo, set `readiness_days_ahead` to the number of days until your test hire starts. Use Run now to test. Publish to switch on the 07:30 weekday schedule.

### 4. Jira MCP server (optional, last)

1. In Jira create two projects with the keys `IT` and `FAC`.
2. Create an API token at id.atlassian.com, Security, API tokens.
3. In PowerShell run, with your own values:
   ```
   docker run -d --name mcp-atlassian --restart unless-stopped -p 9000:9000 -e JIRA_URL=https://your-site.atlassian.net -e JIRA_USERNAME=you@example.com -e JIRA_API_TOKEN=your-token -e ENABLED_TOOLS=jira_create_issue -e ALLOW_GLOBAL_CRED_FALLBACK=true -e TOOLSETS=all ghcr.io/sooperset/mcp-atlassian:latest --transport streamable-http --port 9000
   ```
4. `docker logs mcp-atlassian` should show the server listening on port 9000.
5. In workflow 1 Config set `use_jira` to `true`. The Jira MCP node already points to `http://host.docker.internal:9000/mcp`.

The server only offers `jira_create_issue`. The agent cannot read, change or delete other issues.

### 5. Company website with the assistant (workflow 5)

n8n serves the BrewTec homepage itself, so the website and the chat share one address.

1. Import `workflows/05_website.json`. It needs no credentials. Click Publish.
2. Open http://localhost:5678/webhook/brewtec. The chat bubble talks to workflow 3, which must be published.

**Share it with others (free Cloudflare quick tunnel)**

1. Install once in PowerShell: `winget install --id Cloudflare.cloudflared`
2. Start the tunnel: `cloudflared tunnel --url http://localhost:5678`
3. Copy the address it prints, for example `https://some-words.trycloudflare.com`.
4. Share `https://some-words.trycloudflare.com/webhook/brewtec`.

The tunnel stays open while the PowerShell window runs and your laptop is awake. Each start gives a new address, the page needs no change. Stop it with Ctrl+C after the demo: while it runs, your n8n login page is reachable from the internet too, and every chat uses your Gemini quota.

`site/employee_website.html` is the same page as a file. Opened by double-click it talks to http://localhost:5678.

### 6. Reliability layer (workflows 6 and 7)

1. Supabase SQL Editor: run `02_reliability.sql` (adds the quality_checks table).
2. Import `06_error_alerts.json`. Paste the #brewtec-agent-dev-ops webhook into Config, Postgres credential on Log failure. Save. It does not need to be published.
3. In workflows 1, 2, 3, 4, 5, 7, 8, 9, 10, 11 and 12: open Settings (top right menu), set **Error workflow** to **6 - BrewTec error alerts**, Save.
4. Import `07_weekly_quality_check.json`. Paste the #hr-helpdesk webhook into Config, Postgres credential on the three Postgres nodes. Run now once, then Publish.
5. Re-import workflows 2, 3 and 4 (they gained the safe swap, the AI fallback with answer verification, and the health check). Workflow 3 keeps the same chat URL.
6. Work through `test_pack/reliability_tests.csv`.

`verify_citations` in workflow 3 Config: `true` checks that every cited file and number came from the retrieved text. If every answer is handed off with "no retrieval was recorded", your n8n version does not return the agent's tool calls: set it to `false` and record that in the test sheet.

### 7. Privacy, cache and protection (v3)

1. Supabase SQL Editor: run `03_privacy_cache.sql`. A fresh install gets the same from `01_schema.sql`.
2. In Discord create **#brewtec-agent-dev-ops** and a webhook for it. Technical alerts go there, people questions stay in #hr-helpdesk.
3. Re-import workflows **2, 3, 4, 6 and 7**, and workflow **5** for the new chat notice. Set the credentials again, check Config, Save and Publish. Workflow 3 keeps the same chat URL. Set the Gemini model in workflow 3 to the one you use (the file has gemini-2.5-flash).
4. Config values: workflow 4 and 6 `discord_ops_webhook`, workflow 3 the limits (defaults are fine for the free Gemini tier).
5. Work through R16 to R30 in `test_pack/reliability_tests.csv`. Block H in `verification_checks.sql` shows the results.

**What v3 adds**

| Area | What it does | Where |
| --- | --- | --- |
| Answer cache | A verified answer to the same question is reused for 7 days, in about 1 second without an AI call. Personal answers, hand-offs, follow-ups and quality checks are never cached. Workflow 2 empties the cache after every knowledge base update | WF3 Pre-checks and Log chat, WF2 Log ingestion |
| Input guard | Adds a fixed reply for clearly unrelated requests (weather, jokes, poems, code, sports, crypto). The AI answers OFFTOPIC for other non-work questions, which gets the same reply and no hand-off | WF3 Input guard, Answer check |
| Output guard | Adds checks for leaked instructions or tool names, and for e-mail addresses that are not in the sources | WF3 Answer check |
| Stored data | Questions are stored with e-mail, phone and access codes masked. Personal health statements are stored as a label only. Personal onboarding answers are shown but not stored | WF3 Input guard, Answer check |
| Access codes | Locked after 5 wrong codes in a chat within 30 minutes, and for everyone after 30 wrong codes in 10 minutes. Codes stop working 30 days after the start date. Tried codes are never stored | `onboarding_status` |
| API failures | Fallback message per error type (rate limit, timeout, outage) with a reference number. The same number is in automation_log | WF3 AI unavailable |
| Circuit breaker | After 3 AI failures in 5 minutes, questions get an immediate message instead of a 15 second wait | WF3 Route |
| Rate limits | Polite wait message above 5 questions per minute in one chat, or 6 per minute overall | WF3 Route |
| Logging never blocks | If the database is down, the employee still gets the answer | WF3 Log chat, Reply |
| Retention | Daily: chats after 90 days, code checks and cached answers after 30 days, logs after 1 year, sent-back hires after 180 days | WF4 Data retention |
| Erasure | `select erase_employee('<id>');` removes one person completely | SQL |
| Transparency | The chat states that it is an AI system, what not to type, and how long chats are kept | WF5 website |
| Alert routing | Workflow errors and the health check go to #brewtec-agent-dev-ops | WF4, WF6 |

### 8. Workday as the source of new hires (workflows 8 and 9)

In a real company the hire is created once in the HR system, here Workday, and onboarding reacts to it. Workday has no free sandbox, so workflow 9 plays the Workday tenant and serves the custom report **New_Hires** the way Workday "Report as a Service" does: an HTTPS GET with `format=json` and a Bearer token, answering `{ "Report_Entry": [ ... ] }` with Workday field names. HR creates hires in the Supabase table `hris_employees`, which is the Workday side.

1. Supabase SQL Editor: run `04_hris.sql`. A fresh install gets it from `01_schema.sql`.
2. Import `09_mock_workday_api.json`. Postgres credential on **Read workers**. Change `api_token` in Config. Publish. Open the report URL in the browser: without the token it answers 401.
3. Re-import workflow 1 (trigger **From HR system**, Workday id as duplicate key). Credentials and Config as before, Save and Publish.
4. Import `08_workday_integration.json`. Set `workday_token` to the same value as `api_token`. Postgres credential on **Claim new workers** and **Log sync**. In **Start onboarding (workflow 1)** pick workflow 1. Run now, then Publish.
5. Test with block I in `test_pack/verification_checks.sql` and TC31 to TC36.

| Step | Demo | Production |
| --- | --- | --- |
| HR creates the hire | Row in `hris_employees` | Hire Employee business process in Workday |
| Hire is final | `status = hired` is reported as Successfully Completed | Business process Successfully Completed |
| Integration reads it | WF8 HTTP GET to the WF9 report URL with a Bearer token | HTTP GET to `https://<host>/ccx/service/customreport2/<tenant>/<ISU>/New_Hires?format=json` with the OAuth 2.0 credential of the integration system user |
| Mapping | Supervisory_Organization to department, Location to site | Same |
| Remember who was sent | `workday_sync` (integration side) | Same, or a Workday integration event |
| Duplicate key | Workday Worker_ID | Same |
| Onboarding | Workflow 1, unchanged after the trigger | Same |

Going live means changing two things in workflow 8: the report URL and the credential. Hires In Progress or Rescinded are not started. Each hire runs as its own execution of workflow 1, so one rejected hire never stops the others, and each gets its own HR approval email. A rejected worker shows the reason in `workday_sync_overview`. After HR fixes the data in Workday, delete its row in `workday_sync` and it is picked up again. The form stays as a fallback.

Other production options worth naming: a Workday outbound message on the Hire event to an n8n Webhook (push instead of polling), CData Connect AI as an MCP bridge when an AI agent should query Workday, and the Microsoft Entra ID Workday connector for accounts.

### 9. HR portal (workflow 10)

HR enters hires on a screen, like the Hire Employee task in Workday, instead of in the Supabase table. The portal is at `/webhook/brewtec/hr` and is linked from the company website (nav and footer). Only HR has the login.

1. In n8n create a credential of type **Basic Auth**, for example user `hr` and a strong password. Pick it on the three webhook nodes **HR portal page**, **Submit hire** and **Change status**.
2. Postgres credential on **Load hires**, **Save hire** and **Save status**.
3. Re-import workflow 5 (the website gained the HR portal link). Publish both.
4. Open `http://localhost:5678/webhook/brewtec/hr`, log in, submit a hire. Within 5 minutes workflow 8 starts onboarding, and the portal shows the progress.

| Part | What HR sees or does |
| --- | --- |
| Key numbers | Waiting for HR approval, in onboarding (and starting in 14 days), need attention, not final yet |
| Hires in Workday | Worker ID, name and title, organization and manager, location, hire date, Workday status, onboarding status with task progress and overdue count, device and account |
| Hire employee | Creates the worker. Hire status Successfully Completed starts onboarding, In Progress waits |
| Complete hire, Withdraw | For hires that onboarding has not started yet |

Security: login on every request, a signed page token on every form post (issued by the database, valid 2 hours, so another website cannot submit forms here. n8n serves webhook pages in a browser sandbox, which is why browser origin headers cannot be used), all values HTML-escaped, no caching, the page cannot be framed, and it shows no private e-mail addresses or personal access codes. Every hire and status change is written to `automation_log` with the worker ID only (audit trail). The same person cannot be entered twice. If the database fails, HR gets a clear message instead of an error, nothing half-saved remains, and workflow 6 alerts #brewtec-agent-dev-ops. HR system rules (required fields, lists, real dates, no ID numbers in comments) are checked on the server. Onboarding rules stay in workflow 1, so a Finance hire is valid in Workday but rejected by onboarding with the reason shown in the portal. In production HR signs in with the company SSO (Microsoft Entra ID) and a Workday security group instead of a shared login.

### 10. Secure Employee Payroll Details Form and payroll portal (workflows 11 and 12)

Bank, tax and social security details are the most sensitive data in onboarding. The agent itself never holds them: the AI, the chat log, Discord, LangSmith and n8n's execution history never see them. They go only into an encrypted store that payroll reads.

| Step | What happens | Protection |
| --- | --- | --- |
| 1. Link | 13 days before the start, workflow 4 e-mails a personal link. A new link with each reminder every 3 days until submitted | Single use, valid 14 days, only a SHA-256 hash of the link is stored, a new link stops the old one |
| 2. Form | The new hire enters the personal code from the welcome e-mail, IBAN, tax ID, tax class, social security number, health insurance | IBAN checksum, tax ID and social security check digits, checked again in the database. Locked after 5 wrong codes. Errors never repeat the entered values |
| 3. Storing | IBAN, tax ID and social security number are encrypted inside Postgres (pgcrypto, AES-256) | Key in Supabase Vault, not in a table, not in n8n, not in any export. Separate table `payroll_details`, RLS on, no public access |
| 4. Onboarding | The task "Employee Payroll Details Form submitted" is completed, reminders stop | HR portal and chatbot see only "received" and a masked IBAN `DE89 •••• 3000` |
| 5. Payroll | Payroll opens one record in workflow 12 and transfers it to DATEV | Separate login from HR, every view and transfer written to `payroll_access_log` with the login name |
| 5b. Portals | Signed page tokens on HR and payroll forms | Every portal page carries a token signed with a key derived from the Vault key. Payroll tokens are bound to the payroll login. Forged posts from other websites are refused |
| 6. n8n | Workflows 11 and 12 save no execution data | n8n never writes the values to its own database. Pages are not cached, not framed, keep the link on BrewTec pages (referrer same-origin), run no scripts |
| 7. Retention | Form links are deleted after 30 days. Payroll data follows the legal retention for payroll records and is removed with the employee | `purge_expired_data`, `erase_employee` |

**Setup**

1. Supabase SQL Editor: run `05_payroll.sql`.
2. Create the encryption key once (it is generated inside the database and never shown):
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pfb_encryption_key',
                              'Encrypts IBAN, tax ID and social security number');
   ```
   Never delete or change this secret: without it the stored data cannot be decrypted.
3. Import `11_employee_payroll_details_secure_form.json`. Postgres credential on **Check link** and **Encrypt and save**. Publish.
4. Create a second Basic Auth credential **only for payroll** (for example user `payroll`). Import `12_payroll_portal.json`, pick that credential on its three webhook nodes, Postgres on its three database nodes. Publish.
5. Re-import workflow 4 (personal links and reminders). In its Config, `pfb_form_url` is `http://localhost:5678/webhook/brewtec/pfb` (your tunnel address for others).
6. Re-import workflows 1 and 10 (new task title, Employee Payroll Details Form status in the HR portal).
7. In workflows 11 and 12 open Settings and check that saving execution data is set to "Do not save" (the files set it).

**Honest limits.** Link and code arrive in the same mailbox, so someone with access to the new hire's e-mail could fill in the form. In production the new hire signs in to the HR system's self-service with their own account and two-factor sign-in. The database owner (`postgres`) can read Vault: encryption protects backups, exports and table reads, while separation of duties comes from the payroll role and the access log.

### 11. Automated chatbot tests (workflow 13)

1. Import `13_automated_chatbot_tests.json`. In **Config** paste the chat URL (same as in workflow 7), the #brewtec-agent-dev-ops webhook and the e-mail address for the report. Select the Gmail credential on **E-mail results**.
2. Click **Execute workflow**. It sends 39 questions, one every 10 seconds (below the assistant's rate limit), so it takes about 8 minutes. Do not use the chatbot or run workflow 7 at the same time.
3. Results: one row per test in **Check replies** (pass, fail or retry), an Excel file by e-mail, and the score in Discord. Run it again after every prompt or code change.

### 12. Monitoring with Prometheus and Grafana (optional)

n8n publishes its own numbers (runs, failures, run time, memory) at `/metrics`. Prometheus collects them every 15 seconds and Grafana shows them. Grafana also reads HR figures from Supabase through a read-only login.

1. Start the stack in the `monitoring` folder: `docker compose up -d`. Grafana runs on `http://localhost:3001` (port 3000 is often taken), Prometheus on `http://localhost:9090`. First Grafana login: `admin` / `admin`, then set your own password.
2. Switch on n8n metrics. A container started with `docker run` cannot get new settings, so it is recreated with the same volume. Copy the current settings into a file outside the project folder (it holds API keys, never commit it), add the metrics lines and swap the container:
   ```powershell
   docker inspect n8n --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String -Pattern '^(TZ|GENERIC_TIMEZONE|N8N_ENFORCE|N8N_RUNNERS|LANGCHAIN_)' | ForEach-Object { $_.Line } | Set-Content -Encoding ascii "$HOME\n8n.env"
   Add-Content -Encoding ascii "$HOME\n8n.env" "N8N_METRICS=true","N8N_METRICS_INCLUDE_WORKFLOW_ID_LABEL=true","N8N_METRICS_INCLUDE_MESSAGE_EVENT_BUS_METRICS=true","N8N_METRICS_INCLUDE_API_ENDPOINTS=true"
   docker stop n8n
   docker rename n8n n8n-old
   docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n --env-file "$HOME\n8n.env" docker.n8n.io/n8nio/n8n:2.37.10
   ```
   Check `http://localhost:5678/metrics` and `http://localhost:9090/targets` (n8n is UP), then remove the old container with `docker rm n8n-old`. To go back: `docker stop n8n; docker rm n8n; docker rename n8n-old n8n; docker start n8n`.
3. Dashboard **BrewTec n8n operations** loads by itself (folder BrewTec).
4. HR business view: run `sql/07_grafana_reporting.sql` in Supabase with your own password for `grafana_reader`. In Grafana add a PostgreSQL data source: host from Supabase **Connect > Session pooler**, port 5432, database `postgres`, user `grafana_reader.<project id>`, SSL mode `require`. Open **BrewTec onboarding business view** and pick that data source at the top.

The `grafana_reader` login can read only the seven views in the `reporting` schema: counts per day, month, team or department. It cannot read `employees`, `chat_messages` or `payroll_details`.

## How tasks get done

Automatic tasks (policies, training, 30-day survey) are emailed by workflow 4 on their due date and marked done. The Employee Payroll Details Form is different: workflow 4 e-mails a personal link and a reminder every 3 days, and the task is done only when the new hire submits the secure form (workflow 11). The device reservation and the welcome email are marked done by workflow 1. Manual tasks are marked done in Supabase by the responsible team for this version:

```sql
update onboarding_tasks set completed_at = now(), completed_by = 'facilities'
where task_key = 'badge' and employee_id = '<employee id>';
```

A task form for the teams is phase 2.

## Demo script (short version)

The full talk track, preparation checklist and fallback are in [Demo script](DEMO_SCRIPT.md).

1. HR portal: enter a new hire with hire status Successfully Completed.
2. Within 5 minutes workflow 8 picks the hire up. Show the HR approval e-mail with the AI draft and the check result. Click Approve.
3. Show the welcome e-mail with the personal code, and the Discord posts for IT, Facilities and the manager.
4. Website assistant: "How do I request vacation?" answers with the source. "What do I still need to do?" asks for the code, and with the code lists the open tasks. A typed tax ID is removed, a question about a colleague is refused.
5. Payroll form: open the link, enter the code and test bank data, send. Show the encrypted row and the masked IBAN in the HR portal.
6. Payroll portal: open the record (logged) and mark it transferred to DATEV.
7. Workflow 13: upload the test CSV, show the Excel report. Grafana: operations and business view.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Notion: resource could not be found | Share the database with the integration: page menu, Connections, add n8n BrewTec KB |
| Chatbot cites `[https://...md]` or hands everything off | The File column is a URL property. The Rows node strips https://. Re-run workflow 2 |
| Vector store: dimension mismatch, expected 768 | An old table with another size exists. Run reset_test_data.sql, then the schema, then workflow 2 |
| Vector store: could not find match_documents in the schema cache | Run `notify pgrst, 'reload schema';` in the SQL editor |
| Jira MCP: "Authentication required", log says `rejecting unauthenticated MCP request` | Newer server versions need `ALLOW_GLOBAL_CRED_FALLBACK=true`, so they use the Jira login from the environment. Easiest on Windows: put the variables in an env file outside the repo and start with `--env-file` |
| Jira MCP: connection refused | Check `docker ps` shows mcp-atlassian on port 9000. The node URL is http://host.docker.internal:9000/mcp |
| Jira: issue type Task not found | Your project uses another type name. Change issue_type in the Build team messages node |
| Approval links do not open | WEBHOOK_URL must be the address you open n8n with, for example http://localhost:5678/ |
| Postgres: connection timeout from Docker | Use the Session pooler host, not the direct database host |
| Chat on the website shows a CORS error | Chat trigger options, Allowed origins, add your site address |

## What was tested

See [Testing](TESTING.md) for the test pack, the automated tests and the results.

## Phase 2

Changes in Workday after pickup (new start date, rescinded hire), live Notion sync on page change, a task form for IT, Facilities and managers, the Discord chatbot bridge, real Entra ID accounts through Microsoft Graph, a live dashboard, offboarding, hires outside Germany and starts with less than 14 days notice.
