# Technical questions: answers for the defense

Each answer starts with what to **say** (two or three sentences). **If they ask more** has the details and where to point.

## 1. "Why did you build it this way?"

### The AI never decides anything about a hire. Why not let the model check the data?

**Say:** "Hiring is high risk under the EU AI Act, and a model can be persuaded or can just be inconsistent, so every yes or no is a rule in code that gives the same answer every time and states its reason. The AI only writes text, and even that text passes a code check and HR approval before anyone sees it. That split also made testing possible: I can prove a rule, I can only sample a model."

**If they ask more:**
- The rules are in the workflow 1 node `Validate and plan`: 14 days notice, manager on @brewtec.de, one of four departments, a valid date.
- Tests T01 to T10 run that node directly.
- The welcome draft is checked by `Check welcome draft`: no money, no contract words, greets by name, 40 to 220 words, otherwise a fixed template is used.

### Why do encryption and page tokens live in the database, not in n8n?

**Say:** "I wanted the encryption key to never pass through n8n, because n8n stores execution data and anyone with n8n access could read it. So the key sits in Supabase Vault, and Postgres functions encrypt, decrypt and log in one step. n8n only ever calls `payroll_view(employee, actor)` and never sees the key or stores the result."

**If they ask more:**
- `pgp_sym_encrypt` is AES-256.
- Every decrypt writes `payroll_access_log` in the same function, so a view cannot happen without a log entry.
- Workflows 11 and 12 save no executions.
- The HMAC page tokens use the same idea: `portal_token` is signed with a key derived from Vault.

### Why a mock Workday instead of just a form?

**Say:** "Real companies start onboarding from the HR system, not a form, so I copied Workday's real report contract: same URL shape, Bearer token, same `Report_Entry` field names. Going live means changing the URL and the credential in one Config node, and the rest of the flow stays the same."

### Why OpenRouter for the chat model?

**Say:** "I measured it. On the Gemini free tier the assistant took 24 to 33 seconds and hit rate limits in testing, and after moving the chat model to OpenRouter it answered in about 2.7 seconds. Embeddings stayed on Gemini, so the knowledge base did not need rebuilding."

## 2. "What happens when it fails?"

**Say:** "Every failure ends in a clear message to the person and an alert to the team, never in a silent stop or a guess. The assistant hands off when it cannot prove its answer, the portals show a friendly error page and alert dev-ops, and hires that fail a rule go back to HR with the reason."

**If they ask more, walk one layer at a time:**

| Failure | What the system does | Where |
|---|---|---|
| Bad hire data | Rejected before any AI call, with every reason listed. HR sees it in the HR portal and in `#agent-dev-ops` | WF1 `Validate and plan`, tests T04 to T10 |
| ID number or prompt injection in the chat | Removed or blocked before the AI, stored as `[removed: personal data]` | WF3 `Input guard`, T11 to T16 |
| Answer it cannot prove (low confidence) | No source, a source not retrieved, or a number not in the source: the answer is replaced by a hand-off to People Ops | WF3 `Answer check`, T18 to T21 |
| AI provider down or rate limited | 3 retries, then a friendly message with a reference number. After 3 failures in 5 minutes the circuit breaker answers at once instead of waiting | WF3 `AI unavailable`, `Route` |
| Too many questions | Limits per chat and overall, polite wait message | WF3 `Route` |
| Database down in a portal | Friendly 503 page, "nothing was changed", and a Stop and Error that triggers the alert | WF10, WF12, workflow 6 |
| Any workflow error | Workflow 6 posts the workflow, node and error to `#agent-dev-ops` and writes `automation_log` | WF6 |
| Same hire picked up twice | Claimed in one SQL statement in `workday_sync`, so two runs cannot both start it | WF8 `Claim new workers` |
| Knowledge base rebuild fails halfway | New rows are written first, old rows deleted only after success, so the assistant never goes empty | WF2 `Clear knowledge base` |
| Something quietly degrades | The daily health check posts when approvals wait over 2 days, the AI fails repeatedly, hand-offs spike, the knowledge base is small, or the weekly score drops below 80% | WF4 `Health check` |

## 3. "How do you know it works?"

**Say:** "Three layers. Functional and reliability test cases run by hand with screenshots. 39 automated chatbot tests that pass 39 of 39 (run 12681). And 26 scenario tests including break and safety cases, 25 of which pass. The one that fails is my top failure mode: in longer chats the model sometimes skipped the search, and the answer check caught it and handed off, so nobody got a wrong answer, but People Ops got a needless ticket."

**If they ask more:**
- **Method:** workflow 13 takes a CSV, asks the live assistant every question, checks source, key fact and language, and e-mails an Excel report. The first run was 36 of 39. That found a prompt gap and a citation bug where two files in one bracket were read as one. After the fixes it was 39 of 39.
- **Weekly quality:** 10 golden questions every Monday. The score went from 30% (rate limits) to 90%, and 5 real answers go to a human every week.
- **The bias test found a real bug:** the work e-mail mangled Turkish, Polish and Serbian names, and a Cyrillic name became `.@brewtec.de`. It is fixed, and tests T08 and T09 cover it.
- **Blind spot I found:** every automated test ran in its own chat, so multi-turn problems were invisible. Workflow 13 now has a `session` column and a multi-turn test file.
- **Limit:** the time saving (6 hours down to 1 hour) is a scenario estimate, not timed with real hires.

## 4. "What would you do differently, or next?"

**Say:** "Next, I would take the search decision away from the model: run the search as a fixed step before the AI on every question, so it cannot skip it, and track two numbers to prove it, the share of hand-offs with no recorded search and the hand-off rate on later questions in a chat. If I started over, I would test multi-turn chats and names from different languages from day one, because both problems were found late and both were cheap to test."

**If they ask more:**
- **Version 2 order:**
  1. Forced search step.
  2. Time 5 real hires to replace the 6-hour and 1-hour estimates.
  3. Hosting in Germany with company sign-in.
  4. SharePoint as the knowledge base (most German companies keep policies there).
  5. The real Workday integration user.
- **Scoping differently:** I built two web portals (HR and payroll) myself, which took a large part of the time. In a real company I would use the HR suite's own screens and spend that time on evaluation instead.
- **What I would keep:** rules in code, HR approval, database-side encryption. Every safety test passed because of those choices, not because the model behaved.
