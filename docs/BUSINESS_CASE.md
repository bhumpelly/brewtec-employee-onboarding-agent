# Business case: Employee Onboarding Journey Agent

**For:** BrewTec GmbH management and People Ops · **Amounts:** EUR · **Calculation:** [ROI and cost estimate](ROI.md) (all inputs, formulas, projection and sensitivity)

## Problem

BrewTec's two-person People Ops team coordinates every new hire by e-mail and spreadsheet: welcome e-mail, IT account and laptop, badge and desk, manager tasks, payroll details. This takes about 6 hours per hire, about 24 hours a month at 4 hires, or **€1,080 a month** in labour at €45 per hour. About 1 in 3 hires still starts without working access, and employees ask People Ops the same policy questions again and again.

## Solution

When HR completes a hire in the HR system, the agent checks the data against company rules, drafts a welcome e-mail, and asks HR to approve it with one click. It then sends the welcome, gives IT, Facilities and the manager their tasks with due dates, collects bank and tax details through a secure form, and checks the day before the start that everything is ready. A company assistant on the employee website answers policy questions from official documents, names the source, and passes anything it cannot answer to People Ops.

## Cost

| | Today (capstone) | Production pilot |
|---|---|---|
| **Build** | About 150 hours × €45 = **€6,750** (assumed), no external costs | Plus about 80 hours (€3,600) for hosting in Germany, company sign-in and the real Workday connection |
| **Running per month** | AI about €0.26 (measured), all other tools on free tiers, laptop hosting | About **€210**: server €5.49, Supabase Pro about €22.50 (USD 25 at 0.90), maintenance 4 hours (€180), domain about €1, AI under €1 |
| **People time per month** | 4 hires × 1 hour review = €180 | Same |

## Business value

People Ops time per hire falls from about 6 hours to about 1 hour. The hour left is the part that should stay human: entering the hire, reading and approving the welcome e-mail, and answering hand-offs.

| | Capstone figures | Production view |
|---|---|---|
| Monthly savings | **€900** (€1,080 − €180) | €691 (with server, Supabase Pro and maintenance) |
| Payback of the build | **7.5 months** | 9.8 months, or 15 months including the €3,600 production work |
| Net after 12 months | €4,047 | €1,539 before the production work |

With only the HR clicks observed in the 2 Nov test (about 5 minutes per hire), the savings would be €1,065 a month and payback 6.3 months. The decision uses the cautious 1 hour, because the test did not include reading the draft and answering hand-offs.

If the manual time is 20% lower than assumed, payback stretches to 9.9 months, and if it is 20% higher, to 6.1 months. The ROI is modest because BrewTec hires only 4 people a month. Savings rise in step with hiring volume.

Not counted in these figures: fewer hires starting without access, People Ops answering fewer repeat questions, payroll details never travelling by e-mail. No reliable cost figure exists for these yet.

**Evidence today:** 39 of 39 automated chatbot tests and 10 of 10 multi-turn tests pass, 26 of 26 scenario tests pass, and one hire (Clara Neumann) went from HR entry to DATEV hand-over with a single approval click. In the end-to-end test on 2 Nov 2026, one onboarding run took **17.7 seconds** of machine time, one assistant answer cost **USD 0.00084**, and the HR clicks per hire took about **5 minutes**. All AI calls of the 7 test days together cost USD 0.21. The 6-hour and 1-hour figures are scenario assumptions that have not been timed with real hires yet.

## Recommendation

**Approve a 3-month pilot** with real BrewTec hires, run on a server in Germany, for **€3,600 of setup work and about €210 a month**.

Before the pilot starts:
- **Data protection impact assessment (DPIA):** completed.
- **Works council agreement (Betriebsvereinbarung):** signed.
- **Payroll check:** payroll confirms each new hire's bank details in person before the first salary is paid.

Decide at the end of month 3. Continue only if all three hold:
1. People Ops time per hire, timed on every pilot hire, is 90 minutes or less.
2. No message reached a new hire without HR approval.
3. Fewer than 2% of assistant answers are handed off for lack of a recorded search.

If one of these misses, stop and keep the rules-only part, which needs no AI at all.
