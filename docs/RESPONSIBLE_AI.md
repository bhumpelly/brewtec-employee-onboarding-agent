# Responsible AI checklist

Six questions, each answered with the mechanism in the build and the evidence for it. Test IDs (T01 to T22) refer to [Scenario tests](SCENARIO_TESTS.md). Where something is not done, it says so.

## 1. Bias

**Where the system treats people differently.** The AI never classifies or scores people. Decisions about a hire are made by rules in code (workflow 1, node `Validate and plan`): notice period, manager domain, department, site. These rules read no name, gender, age or origin, so they cannot treat two otherwise identical hires differently. T01 to T06 show the rules giving the same result for different names.

**Bias risk found and fixed: names from other languages.** The code turns every hire's name into a proposed work e-mail. It used a fixed list of German and Western European letters. A test with names from other languages (31 Oct 2026, the live workflow code) showed:

| Name | Proposed work e-mail before the fix |
|---|---|
| Mehmet Yılmaz | `mehmet.ylmaz@brewtec.de` |
| Đorđe Petrović | `ore.petrovi@brewtec.de` |
| Łukasz Wróbel | `ukasz.wrobel@brewtec.de` |
| Олена Шевченко | `.@brewtec.de`, and the hire was still marked valid |

So hires with Turkish, Polish, Serbian or Vietnamese names would get a misspelled address for their whole time at BrewTec, and a name in Cyrillic or Chinese script would get a broken one. Hires with German names were not affected. This is unequal treatment based on origin, even though no AI is involved.

**Fix:** `slug` now applies the German rules (ä to ae), then the letters Unicode does not split (ı, ł, đ), then removes all other accents. A name with no Latin letters gets a neutral `new-hire-<worker id>@brewtec.de` that HR changes before approving. After the fix: `mehmet.yilmaz`, `dorde.petrovic`, `lukasz.wrobel`, `new-hire-21044`. Tests T08 and T09.

**Language.** The assistant answers in English and German. The 39 automated chatbot tests include German questions, and all passed in run 12681 (29 Oct 2026). Reliability test R37 checks a German question with umlauts.

**Not yet checked:** whether the AI welcome draft (workflow 1, Gemini) differs in tone or content by name or gender. Every draft is read and approved by HR before sending, which limits the harm. Planned check before go-live: submit six hires that are identical except for the name (for example Anna Schmidt, Mehmet Yılmaz, Olena Shevchenko, Kwame Mensah, Li Na, Thomas Müller) and compare the drafts side by side.

## 2. Hallucination

The assistant (workflow 3) may only answer from the BrewTec knowledge base. Code on both sides of the AI enforces this:

| Mechanism | Where | Evidence |
|---|---|---|
| Prompt rules: search before every answer, answer only from returned documents, cite every file, copy numbers exactly, reply HANDOFF when the documents do not cover it | `Company assistant`, system message rules 1 to 3 and 8. Temperature 0.1 | Prompt in `workflows/03_company_assistant_chatbot.json` |
| Every answer must cite a source | `Answer check` | T20: answer without a source is never shown |
| The cited file must really have been retrieved in this run | `Answer check` reads the agent's recorded tool calls | T19: invented `[hr-bonus-policy.md]` caught |
| Every number in the answer must appear in the retrieved text | `Answer check` | T18: "32 days" when the policy says 30 is caught |
| On any failure: no answer, hand-off to People Ops in Discord `#hr-helpdesk` | `Hand-off needed?`, `Post to #hr-helpdesk` | Evidence: Discord hand-off posts |
| Only verified, non-personal answers are cached, the cache is cleared when the knowledge base is rebuilt | `Log chat`, workflow 2 `Log ingestion` | T17 |
| Weekly score of 10 golden questions, plus 5 real answers for a human to read | Workflow 7 | Score went from 30% to 90% after the fixes |

**Failure we found:** in a long chat the AI once answered from chat memory without a new search. The answer check correctly refused it ("no retrieval was recorded") and handed off, so the user got no wrong answer, only an unnecessary hand-off. Fix: rule 1 now says to search again for every new question.

**Residual risk:** the checks prove that sources and numbers are real, not that every sentence is true. A wrong statement without a number, citing a correct file, would pass. The weekly human review of 5 real answers is the control for this.

The welcome draft (workflow 1) is checked in code too (`Check welcome draft`): no money amounts, no words like salary, bonus, probation or notice period, no placeholders, greets the hire by name, 40 to 220 words. If any check fails, a fixed template is used instead.

## 3. Transparency

| Who | Do they know it is AI? | Can they see why? |
|---|---|---|
| Employees using the assistant | Yes. The employee website says "You are chatting with an AI system that answers from BrewTec documents" next to the chat. Asked "who are you", it answers that it is an AI system | Yes. Every answer names its source file, for example `[hr-leave-policy.md]`. A hand-off says that no reliable answer was found |
| HR approving a hire | Yes. The approval e-mail shows the AI draft, the result of the code check ("AI draft check: Passed"), the proposed work e-mail and the task plan | Yes. A rejected hire shows the exact rule that failed, for example "Start date is 7 days away. BrewTec needs at least 14 days notice" (T04), in the HR portal and in `#agent-dev-ops` |
| New hire receiving the welcome e-mail | **Not told.** The e-mail is sent by People Ops after HR read and approved it, so HR is the author of record | Not needed: it contains no decision about them |

**Gap:** the welcome e-mail does not say that an AI wrote the first draft. Under the EU AI Act this is HR-reviewed text, but adding one line ("drafted with AI assistance and reviewed by People Ops") would be more open. Planned.

No automated decision is ever sent to a candidate or employee. Rules can only stop a hire on HR's side, where a person reads the reason and decides.

## 4. Human oversight

| Point | Mechanism in the build | Real or theoretical |
|---|---|---|
| Every new hire | Workflow 1, node `HR approval`: Gmail send-and-wait with **Approve** and **Send back**. Nothing reaches the new hire and no tasks are created until HR clicks | Real. The run stops and waits. Evidence: HR approval e-mails and the Clara Neumann end-to-end run |
| Rejected hires | Rules reject, HR sees the reason in the HR portal and fixes the data in Workday. No hire is ever silently dropped | Real. Evidence: `sync_overview` with reason, Discord rejection posts |
| Questions the AI cannot answer | Hand-off to People Ops in `#hr-helpdesk` | Real. A person answers. Evidence: Discord hand-off screenshots |
| Payroll data | Only the payroll team opens records, one at a time, and marks the DATEV transfer by hand | Real. Every view in `payroll_access_log` |
| Answer quality | Weekly report with 5 real answers for a human to check | Real but depends on someone reading it. The health check alerts if the score drops below 80% or the check stops running |
| Stopping the system | Each workflow can be deactivated in n8n. The circuit breaker stops AI calls after repeated failures | Real |

Weak spot: approval fatigue. If HR approves dozens of hires a week, the click can become routine. The approval e-mail therefore puts the check results and the proposed e-mail at the top, so HR has a short list to read.

## 5. Security and access

| What | Mechanism |
|---|---|
| API keys and passwords | Stored only in n8n credentials (encrypted with `N8N_ENCRYPTION_KEY`) and Supabase Vault. Workflow exports contain credential names only |
| Bank, tax and social security data | Only in the secure form (workflow 11), validated by checksum, encrypted with AES-256 (`pgp_sym_encrypt`), key in Supabase Vault. Never in chat, e-mail, Discord, LangSmith or n8n execution data |
| Employee website | Personal login per employee (bcrypt, lockout after 5 wrong passwords, login log), public page without the assistant |
| HR and payroll portals | Separate logins, HMAC-signed page tokens on every form, no execution data saved for payroll |
| Database | Functions callable only by the service role, Grafana uses a read-only role on summary views |
| Mock Workday API | Bearer token, 401 without it |
| Chat input | ID numbers removed before the AI (T11), requests for other people's data refused (T12), prompt injection blocked in English and German (T14) |

**No secret in the repository (checked 1 Nov 2026).** The 13 live workflow exports were scanned for Discord webhooks, Gmail addresses, tokens, API keys, credential IDs and the instance ID. Found and replaced: 5 Discord webhook URLs, the HR and report Gmail addresses, the Workday token, the Notion database link. A second scan found none left. The screenshot folder is not in the repository (`.gitignore`). Screenshots used in the slides were redacted (Gmail sidebar, names, tokens, webhook URLs).

**Honest note:** an earlier push contained screenshots with real Discord webhook URLs. The repository was deleted and recreated with a clean history, and the webhooks are being regenerated.

## 6. The failure that would matter most

**Salary paid to the wrong person.** The welcome e-mail contains the personal code, and later the payroll form link goes to the same private e-mail address. If HR types the private e-mail wrong in Workday, or the hire's mailbox is taken over, a stranger receives both. They could submit their own IBAN, it passes the checksum, it is stored encrypted, and payroll transfers the first salary to them. Nobody would notice until the new hire asks where their pay is.

**What limits it today:** HR sees the private e-mail in the approval e-mail before anything is sent. The form link works once and expires after 14 days. The code locks after 5 wrong tries. Every payroll view and transfer is logged.

**What a real deployment needs:** payroll confirms the bank details with the employee in person on day 1 before the first transfer, and the IBAN account holder name is matched against the employee name. Both are process steps outside the agent, listed for the works council and payroll before go-live.

Second most serious: a wrong policy answer that someone acts on (for example a wrong deadline for a sick note). Controlled by the hallucination checks in section 2, and the residual risk is named there.
