# Employee Onboarding Journey Agent: project summary

**Capstone project, November 2026** · BrewTec GmbH (fictional) · Repository: github.com/bhumpelly/brewtec-employee-onboarding-agent

## Problem

BrewTec GmbH, a coffee equipment company with 84 employees in Koeln and Leverkusen, onboards new hires with a two-person People Ops team working from e-mail and spreadsheets. Each hire takes about 6 hours of coordination: the welcome e-mail, IT account and laptop, badge and desk, manager tasks and the payroll details. At about 4 hires a month this is roughly €1,080 of labour a month, and about 1 in 3 hires still starts without working access. Employees also ask People Ops the same policy questions again and again. The work is repetitive, rule-based and spread over many tools, which made it a good candidate for automation. It also touches personal and payroll data in an area the EU AI Act treats as high risk, so the automation has to keep people in control. All figures are scenario assumptions for a fictional company.

## Solution

The agent is built from 13 n8n workflows with Supabase, Gemini and OpenRouter models, Notion, Gmail and Discord. When HR completes a hire in the HR system (a mock of the Workday report API), rules in code check the data and plan 25 onboarding tasks. The AI drafts a welcome e-mail, code checks the draft, and HR approves it with one click in Gmail. The agent then sends the welcome with a personal code, posts the tasks to IT, Facilities and the manager, collects bank and tax details through a secure single-use form that stores them encrypted, and runs a day-1 readiness check. Payroll opens records in a separate portal where every view is logged. A company assistant on the employee website answers policy questions from the knowledge base in English or German, always names its source, and hands questions it cannot answer to People Ops. Error alerts, a weekly quality check, automated chatbot tests, LangSmith tracing and Grafana dashboards keep it observable.

## Decisions worth defending

- **Rules in code decide, the AI only writes.** I considered letting the model validate hire data and pick tasks, which would have been faster to build. I rejected it because a model is not repeatable and cannot be proven correct, and employment decisions are high risk. Every yes or no is now a rule with a stated reason, and every AI text passes a code check and HR approval.
- **Encryption inside the database, not in n8n.** The simpler option was encrypting in an n8n Code node. I rejected it because n8n stores execution data, so the key or the values could end up there. The key lives in Supabase Vault, Postgres functions encrypt, decrypt and log in one step, and the payroll workflows store no executions.
- **A hand-off instead of a best guess.** I considered letting the assistant answer from general knowledge when the documents were thin. I rejected it: an answer is shown only if it cites a document that was really retrieved and every number appears in it. Otherwise it goes to People Ops.

## What testing revealed

Testing changed the design several times:

- **Repeated automated runs found a citation bug.** A correct answer citing two files in one bracket was handed off.
- **A monitoring dashboard exposed a 70% failure rate** caused by an unrelated workflow.
- **A bias test found that the work e-mail generator mangled names from other languages.** A Cyrillic name became ".@brewtec.de". It is fixed, and a live hire on 3 Nov, Ayşe Yıldız, got ayse.yildiz@brewtec.de.

The final result: 39 of 39 automated chatbot tests, 10 of 10 multi-turn tests in real chats, 26 of 26 scenario tests including all safety and break cases, and a weekly quality score that went from 30% to 90%. In the end-to-end test on 2 Nov, one onboarding run took 17.7 seconds of machine time and one assistant answer cost USD 0.00084.

**Top failure mode:** in longer chats the model sometimes skipped the document search and answered from memory. The answer check caught this and handed off, so no wrong answer reached anyone, but it caused needless tickets. A prompt rule and multi-turn tests address it now, and all 10 multi-turn tests pass. The full fix, a fixed search step before the AI, is planned for version 2.

**Limitation I could not fully resolve:** the business case rests on assumed figures. The 6 hours per hire before and 1 hour after have not been timed with real hires, so the 7.5-month payback is an estimate. A 3-month pilot with timed hires is the recommended next step.
