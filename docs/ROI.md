# ROI and cost estimate

All amounts in **EUR**. The only other currency is the AI price in USD, converted at a stated rate (see input A6). Every input is labelled:
- **measured:** taken from the build or the test runs.
- **assumed:** a scenario figure or estimate.
- **not reliably quantifiable:** no credible figure exists, so it is left out of the totals and never counted as zero.

An editable version with the same formulas is in [`roi_calculator.html`](roi_calculator.html). Download it and open it in a browser.

**Problem:** BrewTec's People Ops team coordinates every new hire by hand over e-mail and spreadsheets. **Process owner:** People Ops (HR).

## Inputs

### Baseline, per month

| # | Input | Value | Label | Source or reason |
|---|---|---|---|---|
| B1 | Monthly volume (new hires) | 4 | assumed | BrewTec scenario, 84 employees |
| B2 | Manual minutes per hire | 360 | assumed | Scope document: about 6 hours of coordination per hire |
| B3 | Hourly labour cost | €45.00 | assumed | Destatis 2025 average labour cost per hour worked, applied to HR |
| B4 | Baseline error/rework rate | 33% | assumed | About 1 in 3 hires start without working access (scenario) |
| B5 | Cost per error/rework item | not set | not reliably quantifiable | A lost first day and rushed IT work, but no data on cost |
| B6 | Other recurring baseline cost | €0 | assumed | E-mail and spreadsheets are already paid for |

### After automation, per month

| # | Input | Value | Label | Source or reason |
|---|---|---|---|---|
| A1 | Human-review minutes per hire | 60 | assumed | Target: HR portal entry, approval click, hand-off answers. In the 2 Nov end-to-end test the HR clicks themselves took about 5 minutes per hire (observed, not stopwatch-timed), so 60 minutes is a cautious figure |
| A2 | Residual error/rework rate | not set | not reliably quantifiable | The day-1 readiness check flags gaps, but there is no production data |
| A3 | Residual rework cost per item | not set | not reliably quantifiable | As above |
| A4 | Hosting | €0 | measured | Local Docker build on a laptop |
| A5 | AI cost per question | USD 0.00084 | measured | Average of 10 chat answers in LangSmith on 2 Nov 2026: about 2,300 tokens and USD 0.00072 to 0.00098 per answer (Gemini 2.5 Flash on OpenRouter). The earlier estimate was USD 0.00255 |
| A6 | Exchange rate | 0.90 EUR per USD | assumed | Stated and rounded up, used for the AI cost only |
| A7 | Assistant questions per month | 340 | assumed | 84 employees × about 3, plus 40 weekly quality-check questions and one 49-question test run |
| A8 | Other tools | €0 | measured | Supabase, Notion, Discord, LangSmith, Gmail, Gemini embeddings and the Cloudflare quick tunnel all run on free tiers |
| A9 | Other recurring operating cost | €0 | assumed | None today. Maintenance is added in the production view below |

### One-time implementation

| # | Input | Value | Label | Source or reason |
|---|---|---|---|---|
| I1 | Build and setup hours | 150 | assumed | Capstone build over 4 sprints, estimated |
| I2 | Hourly labour rate | €45.00 | assumed | Same as B3 |
| I3 | One-off external costs | €0 | assumed | No domain, licence or hardware was bought |

## Results

### 1. Baseline monthly cost

```
Manual labour   = B1 × B2 ÷ 60 × B3 = 4 × 360 ÷ 60 × 45 = €1,080.00
Baseline rework = not reliably quantifiable, excluded
Baseline cost   = €1,080.00 + rework (excluded) + €0.00 = €1,080.00
```

### 2. Automated monthly cost

```
Review labour   = B1 × A1 ÷ 60 × B3 = 4 × 60 ÷ 60 × 45  = €180.00
Residual rework = not reliably quantifiable, excluded
AI cost         = A7 × A5 × A6 = 340 × 0.00084 × 0.90  = €0.26   (USD 0.29)
Automated cost  = €180.00 + rework (excluded) + €0 hosting + €0.26 + €0 tools + €0 = €180.26
```

### 3. Monthly savings

```
Savings = €1,080.00 − €180.26 = €899.74
```

### 4. One-time implementation cost

```
One-time = I1 × I2 + I3 = 150 × 45 + 0 = €6,750.00
```

### 5. Payback period

```
Payback = €6,750.00 ÷ €899.74 = 7.50 months
```

### 6. 12-month projection

Cumulative net = monthly savings × month − one-time cost.

| Month | Cumulative savings | Cumulative net after build cost |
|---|---|---|
| 1 | €899.74 | −€5,850.26 |
| 2 | €1,799.48 | −€4,950.52 |
| 3 | €2,699.22 | −€4,050.78 |
| 4 | €3,598.96 | −€3,151.04 |
| 5 | €4,498.70 | −€2,251.30 |
| 6 | €5,398.44 | −€1,351.56 |
| 7 | €6,298.18 | −€451.82 |
| **8** | **€7,197.92** | **€447.92** (first month in profit) |
| 9 | €8,097.66 | €1,347.66 |
| 10 | €8,997.40 | €2,247.40 |
| 11 | €9,897.14 | €3,147.14 |
| 12 | €10,796.88 | €4,046.88 |

### 7. Sensitivity: the largest assumption ±20%

The largest assumption is B2, the manual minutes per hire. It sets the baseline, so it drives almost all of the savings. Volume (B1) moves the result in the same proportion.

| Case | Manual minutes | Monthly savings | Payback | Net after 12 months |
|---|---|---|---|---|
| 20% worse | 288 | €683.74 | 9.87 months | €1,454.88 |
| As assumed | 360 | €899.74 | 7.50 months | €4,046.88 |
| 20% better | 432 | €1,115.74 | 6.05 months | €6,638.88 |

## Measured in the end-to-end test (2 Nov 2026)

On 2 Nov 2026 the full process ran with several test hires (HR portal, Workday sync, approval, welcome e-mail, Notion, Discord, Jira tickets, payroll form, assistant). These figures come from the monitoring tools, not from assumptions.

| What | Value | Source |
|---|---|---|
| Machine time of one onboarding run (workflow 1) | **17.7 s** on average, without the wait for HR approval | Prometheus, `n8n_workflow_execution_duration_seconds` for workflow 1 |
| AI cost per assistant answer | **USD 0.00084** on average (about 2,300 tokens) | LangSmith, 10 chat traces |
| Assistant answer time | about **2 s** (1.8 to 4.4 s) | LangSmith |
| All AI calls in 7 days, including every test run | **USD 0.21** for 276 traces | LangSmith project overview |
| AI cost per hire, with about 20 assistant questions | under **USD 0.03** | 20 × USD 0.00084, plus the welcome draft and Jira agent on the Gemini free tier |
| HR clicks per hire | about **5 minutes**: enter the hire, approve, create the website login | Observed in the test, not stopwatch-timed |
| Failed runs on the test day | **4 of 323 (1.24%)** | Grafana, n8n operations dashboard |
| Chatbot tests | **39 of 39** core (2 Nov) and **10 of 10** multi-turn (3 Nov) | Workflow 13, runs 13356 and 13515 |

Screenshots: [LangSmith overview](images/measured_langsmith_overview.png) · [cost per answer](images/measured_chat_cost.png) · [run time of workflow 1](images/measured_workflow1_runtime.png) · [run time of all workflows](images/measured_runtime_all_workflows.png) · [Grafana operations](images/measured_grafana_operations.png)

**The same calculation with the observed HR time.** If only the observed 5 minutes of HR clicks per hire are counted instead of the assumed 60 minutes:

```
Review labour   = 4 × 5 ÷ 60 × 45 = €15.00
Automated cost  = €15.00 + €0.26 AI = €15.26
Monthly savings = €1,080.00 − €15.26 = €1,064.74
Payback         = €6,750.00 ÷ €1,064.74 = 6.34 months
```

This is not used for the decision: the test measured the clicks, not the time HR spends reading the welcome draft and answering hand-offs. The business case keeps the cautious 60 minutes (7.50 months).

**What this changes:** the AI cost is confirmed as negligible, and the observed HR clicks support the 60-minute review assumption as cautious. **What it does not change:** the 6 hours of manual work per hire (B2) is still a scenario figure, so the payback stays an estimate until real hires are timed in the pilot.

## Cost estimate for production

The capstone runs on a laptop with free tiers. A real pilot needs paid hosting and maintenance time. Prices were checked on 1 Nov 2026.

| Item | Per month | Label | Note |
|---|---|---|---|
| Server in Germany (Hetzner CX23) | €5.49 | assumed | Price after the 2026 increase |
| Supabase Pro | €22.50 (USD 25 × 0.90) | assumed | The free plan pauses after 1 week without traffic and has no backups. Not acceptable for payroll data |
| Maintenance | €180.00 (4 h × €45) | assumed | Updates, prompt changes, re-running the 49 chatbot tests, reviewing alerts |
| Domain | about €1 | assumed | About €10 a year |
| AI | €0.26 | measured | As A5 to A7. Gemini drafts and embeddings on the paid tier cost cents |
| n8n self-hosted, LangSmith Developer, Discord | €0 | measured | Free at this size. LangSmith Plus is USD 39 per seat if more people need access |
| **Extra running cost** | **€208.99** | | |
| One-time production setup | €3,600 (80 h × €45) | assumed | Hosting with HTTPS, company sign-in, real Workday integration user |

```
Automated cost (production) = €180.26 + €208.99 = €389.25
Monthly savings             = €1,080.00 − €389.25 = €690.75
Payback (capstone build)    = €6,750 ÷ €690.75 = 9.77 months
Payback (with production)   = (€6,750 + €3,600) ÷ €690.75 = 15.0 months
Net after 12 months         = €690.75 × 12 − €6,750 = €1,539.00 (before the production setup)
```

## Limitations

- **Fictional company.** BrewTec is invented, so B1, B2, B4 and A1 are scenario figures, not measurements. Timing 5 real hires would replace the two most important ones (B2 and A1).
- **Rework is left out, not set to zero.** Including it would raise the savings, so leaving it out is the cautious choice.
- **Assistant time savings are not counted.** Fewer repeat questions to People Ops is a real benefit but has not been measured.
- **AI cost is measured, but small.** The measured cost per answer is a third of the earlier estimate. At this volume it changes the monthly savings by only €0.52, so the business case depends on the HR time, not on the AI.
- **Low volume makes payback slow.** At 8 hires a month the savings double and payback roughly halves.

Sources: [Destatis labour cost 2025 (Der Betrieb)](https://der-betrieb.de/meldungen/45-euro-pro-stunde-arbeitskosten-belasten-betriebe/), [Gemini 2.5 Flash on OpenRouter (LLM Reference)](https://www.llmreference.com/model/gemini-2.5-flash/openrouter), [Hetzner 2026 prices](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do), [Supabase pricing](https://selfhost.dev/supabase-pricing-explained/), [LangSmith pricing](https://www.langchain.com/langsmith-pricing).
