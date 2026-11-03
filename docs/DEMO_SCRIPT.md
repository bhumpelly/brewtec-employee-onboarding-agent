# Presentation and demo script

Target: about 7 minutes, then questions. The deck follows the order a stakeholder needs: company and problem, solution, one hire end to end, testing, deployment and monitoring, governance, cost and the ask. Slides for the end-to-end process double as the fallback if the live demo fails. Next steps and the roadmap come after "Questions" as backup.

## 1. Preparation (30 minutes before)

| Step | Check |
|---|---|
| Start Docker Desktop and n8n | `http://localhost:5678` opens |
| Reconnect the Gmail credential in n8n and send one test e-mail | Gmail logins expire after 7 days in testing mode |
| Start the Jira MCP server: `docker start mcp-atlassian` | `docker ps` shows it Up on port 9000 |
| Optional, only if others open it on their own devices: start the tunnel and set `chat_url` and `pfb_form_url` in workflows 1 and 4 to the new address | The demo itself runs on localhost |
| Run workflow 2 once if Notion changed | Log says "… chunks, … cached answers cleared" |
| Delete earlier demo data for Lena if needed | `sql/reset_test_data.sql` or a fresh name |
| Window 1: HR portal `/webhook/brewtec/hr`, already logged in | Login box not shown during the talk |
| Window 2: n8n with workflow 8 open on the canvas | No credentials page open |
| Window 3: Gmail, mail list only, the approval label open | Sidebar collapsed, no other mails visible |
| Window 4: Discord on `#it` | |
| Window 4b: Jira board BrewTec IT | Empty or only old tickets visible |
| Window 5: employee area `/webhook/brewtec/employees`, logged in as Jonas | |
| Screen recording running (Win + G) | This is also your fallback |
| Close every other tab, mute notifications | |

**Never show:** n8n credentials, the Config node with webhook links, the env file, Supabase API keys, your real Gmail sidebar.

## 2. Talk track

About 7 minutes. Slides marked **click** get one sentence or none, they are there for questions and as a fallback if the live demo fails.

| Slide | Time | Say |
|---|---|---|
| 1 Cover | 10 s | "An onboarding agent for BrewTec. Here is the plan." |
| 2 Agenda | 10 s | "Six parts: the company and its problem, the solution, one hire end to end, testing, deployment and monitoring, and finally governance and the business case." |
| 3 Company profile | 15 s | "BrewTec builds coffee equipment, 84 people, two sites, about 4 hires a month, and a People Ops team of two." |
| 4 Business problem | 25 s | "About 6 hours of coordination per hire, and 1 in 3 hires starts without working access. Success means about 1 hour per hire, nothing sent without HR approval, and every answer cited or handed to a person." |
| 5 Solution overview | 20 s | "One hire across five teams. People act only in the dark boxes, everything else runs by itself." |
| 6 Key design decision | 15 s | "The AI writes, rules check, people decide. Hiring is high risk under the EU AI Act, so the AI never decides about a person." |
| 7 Architecture | 20 s | "13 workflows in four groups, 8 services. New since today: IT and Facilities tickets in Jira through an MCP server." |
| 8 Live demo | 2 min | Steps in section 3. If it fails, click through slides 9 to 16 instead |
| 9 to 16 End-to-end process | click | HR system, HR portal and welcome, workflow 1, Jira tickets, payroll data, database, HR view, assistant. Fallback for the live demo |
| 17, 18 Testing | 15 s | "Manual end-to-end tests with evidence, and 39 automated chatbot tests from a CSV file." |
| 19 Test results | 25 s | "All 26 scenarios pass, including all 10 safety cases. 39 of 39 chatbot tests, and 10 of 10 multi-turn tests in real chats." |
| 20 A real bug | click | |
| 21 Main risk | 25 s | "In longer chats the AI sometimes skipped the search. The check caught it, so no wrong answer, but needless tickets. Fixed with a clearer rule, 10 of 10 multi-turn tests pass. Next: a fixed search step before the AI." |
| 22 Lessons learned | click | |
| 23 Monitoring | 20 s | "Three views: LangSmith for the AI, Grafana for the workflows and a business view for HR. On the full test day 4 of 323 runs failed, 1.2 percent, and each failure was explained." |
| 24 Cloudflare tunnel | click | |
| 25 Responsible AI | 20 s | "High risk under the EU AI Act, so people keep every decision, payroll data is encrypted, and every test hire is fictional." |
| 26, 27 Access, guardrails | click | |
| 28 Business case | 25 s | "About €900 a month saved, payback in about 7.5 months, about 10 months in production." |
| 29 Measured cost | 20 s | "Measured, not assumed: one onboarding run takes 18 seconds of machine time, one answer costs less than a tenth of a cent, all AI calls of the test week cost 21 cents. The saving is HR time. My ask: a 3-month pilot that times real hires." |
| 30 Measured run time | click | Backup for "how fast is it": 17.7 s per onboarding run in Grafana |
| 31 Questions | | |
| 32, 33 Next steps, roadmap | backup | For questions about production |

## 3. Live demo steps

| # | Do | Point at | Success criterion |
|---|---|---|---|
| 1 | HR portal: Hire employee, Lena Schmidt, Marketing, Koeln, start in 21 days, manager Julia Neumann, julia.neumann@brewtec.de, status Successfully Completed. Submit | Green message with the worker ID | Input comes from the HR system, not a form in n8n |
| 2 | n8n workflow 8: click **Run now** (saves waiting up to 5 minutes) | **Validate and plan** output: valid true, work e-mail, 25 tasks | Rules decide, not the AI |
| 3 | Gmail: open the approval e-mail | "AI draft check: Passed", the proposed e-mail, the draft | Nothing has reached Lena yet |
| 4 | Click **Approve** | | One HR click |
| 5 | Discord `#it`: the new task post, then the Jira board BrewTec IT | "Lena S." only, no private data. New IT tickets in Jira | Data minimisation, tickets created by the agent |
| 6 | Employee area: "How many vacation days do full-time employees get per year?" | 30 days and the source chip `hr-leave-policy.md` | Every answer cites a retrieved document |
| 7 | Optional, if time: "My IBAN is DE89 3704 0044 0532 0130 00" | Blocked, removed before the AI | No personal data reaches the AI |

**If something fails live:** say "the live system is not responding, here is the same run from this morning", and switch to the recording or to the appendix screenshots (HR welcome, hire stored, payroll security, HR view). Do not debug on stage.

## 4. Trace one input through the architecture

Lena's hire, from trigger to output:

1. **HR portal (workflow 10)** writes her to `hris_employees`, which plays the Workday side.
2. **Workday integration (workflow 8)** calls the **mock Workday report API (workflow 9)** with a Bearer token and maps the fields. It claims her in `workday_sync`, so she cannot be started twice.
3. **Intake and approval (workflow 1):**
   - **Validate and plan** applies the rules and plans the tasks.
   - Gemini drafts the welcome e-mail.
   - **Check welcome draft** checks the draft in code.
   - **HR approval** sends the Gmail send-and-wait e-mail and stops.
4. After Approve, workflow 1:
   - reserves a laptop from the Supabase inventory,
   - creates the simulated account,
   - writes 25 tasks to `onboarding_tasks`,
   - sends the welcome e-mail with her personal code,
   - posts the team tasks to Discord,
   - creates Jira tickets for IT and Facilities through the Jira MCP server (create issue only).
5. **Daily scheduler (workflow 4)** sends the payroll form link 13 days before her start date and runs the day-1 readiness check.
6. **Payroll form (workflow 11)** checks her bank and tax details and stores them encrypted. **Payroll portal (workflow 12)** decrypts them for one person at a time and logs every view.
7. **Company assistant (workflow 3)** answers her questions:
   - the input guard runs first,
   - then the pre-checks,
   - the AI with `handbook_search` on Supabase pgvector answers,
   - the answer check verifies the answer,
   - the question is logged.
8. **Error alerts (workflow 6)**, **LangSmith** and **Grafana** watch all of it.

## 5. Reviewer final check, answered

| Question | Answer in one breath | Where |
|---|---|---|
| Trace one input | Section 4 above | Architecture slide |
| Does the diagram match the build? | Yes: 13 workflows, 8 services including Jira via MCP, the public page and employee area, the OpenRouter chat model. Updated on 2 Nov after the Jira integration was tested | `docs/images/architecture.png` |
| Malformed input, failed integration, low confidence? | Malformed hire: rejected with every reason (WF1 `Validate and plan`). Failed integration: retries, then a friendly page and a dev-ops alert (WF6). AI not confident: the answer check hands off to People Ops (WF3 `Answer check`) | [Technical questions](TECHNICAL_QA.md#2-what-happens-when-it-fails) |
| One test that changed the design | The repeated chatbot run that failed a correct answer citing two files in one bracket. The answer check and the website now accept both formats | Appendix slide "A real bug" |
| Top failure mode, unsoftened | The AI sometimes skipped the knowledge base search in longer chats and relied on memory. That caused needless hand-offs. A clearer prompt rule fixed it, 10 of 10 multi-turn tests pass, but it still depends on the model, so a fixed search step is next | [Improvement plan](IMPROVEMENT_PLAN.md) |
| Why not something simpler? | BrewTec's problem is hand-offs across HR, IT, Facilities and Payroll, and it touches payroll data. Rules in code handle the hand-offs, and the time saving comes mostly from them. The AI is only used where text is needed. A rules-only version is my fallback if the AI part does not pay off | [Stakeholder questions](STAKEHOLDER_QA.md#3-why-this-approach-and-not-something-simpler) |
