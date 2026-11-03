# Stakeholder questions

Honest answers to the four questions a BrewTec manager is most likely to ask. Amounts in EUR. Prices checked on 1 Nov 2026.

## 1. What does it really cost?

| Item | Now (capstone) | In production | Note |
|---|---|---|---|
| n8n | €0 | €0 | Self-hosted Community edition. Internal company use is allowed |
| Server | €0, runs on a laptop | €5.49 a month | Hetzner CX23 in Germany, after the 2026 price rise |
| Supabase (database, encryption key) | €0, free plan | USD 25 a month, about €22.50 | The free plan pauses after 1 week without traffic and has no backups. Not acceptable for payroll data |
| AI chat model (Gemini 2.5 Flash through OpenRouter) | about USD 0.87 a month | about USD 1 a month | USD 0.30 per 1M input tokens, USD 2.50 per 1M output tokens. About 340 questions a month |
| Gemini welcome drafts and embeddings | €0, free tier | A few cents a month on the paid tier | Free tier input may be used by Google to improve its products, so production must use the paid tier |
| LangSmith (AI tracing) | €0 | €0 | Developer plan: 5,000 traces a month, 1 seat. Plus is USD 39 per seat if a second person needs access |
| Notion, Gmail, Discord | €0 | €0 at this size | In a real company: SharePoint, Outlook and Teams, already licensed |
| Maintenance | not counted | 4 hours a month, €180 | Updates, prompt changes, re-running the 49 chatbot tests, looking at alerts |
| **Running total** | **about €1 a month** | **about €210 a month** | |

**To build further:** about 80 hours (€3,600) for production: deployment in Germany with HTTPS, company sign-in instead of Basic Auth, the real Workday integration user, and switching off stored executions for the assistant. The bigger items in the improvement plan (SharePoint as the knowledge base, a forced search step) are version 2, about another 40 hours.

**The honest point:** maintenance, not AI, is the largest running cost. AI costs about €1 a month at BrewTec's size. A model update that changes answers is the real ongoing expense, because every change needs the 49 tests re-run.

## 2. What is the biggest risk, and what would we do?

**A first salary paid to a stranger.** The welcome e-mail with the personal code and the payroll form link both go to the private e-mail address HR entered. If HR mistypes it, a stranger could submit their own IBAN. It would pass the checksum and be transferred. ([Responsible AI, section 6](RESPONSIBLE_AI.md#6-the-failure-that-would-matter-most))

- **Today:** HR sees the private e-mail before approving. The link works once and expires after 14 days. The code locks after 5 wrong tries. Every payroll view is logged.
- **Before the pilot:** payroll confirms the bank details with the employee in person on day 1, before the first transfer. This is a process step, costs 2 minutes per hire, and closes the gap fully.

**Second risk: a wrong policy answer someone acts on.** The answer check blocks invented numbers and sources (tests T18 to T21), but a wrong sentence without a number, citing the right file, would pass. The control is the weekly human review of 5 real answers, and a policy owner for every document.

**Regulatory risk:** employment is high risk under the EU AI Act. The design keeps every decision with rules or HR, but the DPIA and works council agreement are not done. **The pilot must not start without them.**

## 3. Why this approach, and not something simpler?

| Option | What you get | Trade-off |
|---|---|---|
| **Do nothing** | No cost, no risk | €1,080 a month of People Ops time stays, and 1 in 3 hires still starts without access |
| **Rules only, no AI** (n8n tasks, reminders, readiness check, fixed welcome template) | **Most of the time saving.** The task plan, Discord hand-offs and readiness check are code, not AI | No company assistant, so repeat questions stay with People Ops. The welcome e-mail is a template instead of a personal draft |
| **Built-in onboarding in the HR suite** (Workday Onboarding, Personio) | Vendor support, no custom code to maintain | Needs a licence BrewTec may not have, and usually does not reach Discord or Teams tasks or a policy chatbot. Worth checking first if BrewTec already pays for it |
| **Fully automatic, no HR approval** | Saves the 5-minute approval per hire | Not acceptable: an AI-drafted message about a person would go out unreviewed in a high-risk area |
| **This agent** (rules + AI drafts + approval + assistant) | Time saving plus the assistant, with human approval | Custom code to maintain, and an AI model that can change under it |

**The honest answer:** the business case is carried by the rules automation, not by the AI. If budget is tight, BrewTec should run the rules-only version first. The AI parts are the welcome draft and the assistant. The draft saves little time. The assistant's value is real but not measured yet. That is why the pilot measures hand-offs and People Ops time.

## 4. When does the value arrive?

| Phase | Months | Value |
|---|---|---|
| DPIA, works council, deployment in Germany | 1 to 2 | None yet, €3,600 spent |
| Pilot with real hires | 3 to 5 | About €691 a month saved, if the 1 hour per hire holds |
| Build cost paid back | **about 10 months after go-live** (7.5 on capstone figures) | |
| Including production work | about 15 months after go-live | |

**Weakness, and how we address it:** the 6 hours before and 1 hour after are scenario assumptions, not timings, and BrewTec hires only 4 people a month, so a small change in either moves payback by months. We address this by timing the first 5 pilot hires (`test_pack/time_saved_hires.csv`) and putting the go or stop decision at month 3 on that measurement, not on this estimate. At 8 hires a month, payback would halve.

## Sources

- Hetzner CX23 at €5.49 a month after the 2026 price change: [Private DevOps](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do)
- Supabase plans, free plan pausing and Pro at USD 25: [selfhost.dev](https://selfhost.dev/supabase-pricing-explained/)
- LangSmith Developer and Plus plans: [LangChain](https://www.langchain.com/langsmith-pricing)
- Gemini 2.5 Flash on OpenRouter: [LLM Reference](https://www.llmreference.com/model/gemini-2.5-flash/openrouter)
- Labour cost €45.00 per hour worked in 2025 (Destatis): [Der Betrieb](https://der-betrieb.de/meldungen/45-euro-pro-stunde-arbeitskosten-belasten-betriebe/)
