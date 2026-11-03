# Monitoring and operations

Four layers tell People Ops and the agent team what the agent is doing and when something breaks.

| Layer | Tool | Answers |
|---|---|---|
| Errors | Workflow 6 and Discord `#agent-dev-ops` | What failed, where, right now? |
| AI quality | LangSmith and workflow 7 | Is the assistant still answering correctly? |
| Operations | Prometheus and Grafana | Is n8n up, how many runs fail, how fast? |
| Business | Grafana business view on Supabase | How many hires, which tasks are overdue, who is ready for day 1? |

## 1. Error alerts (workflow 6)

Every workflow uses workflow 6 as its error workflow. On any failure it posts the workflow name, the failed node and the error message to `#agent-dev-ops` in Discord, and writes a `workflow_failed` row to `automation_log`.

Workflow 4 also runs a daily **health check** (database, knowledge base size) and posts an alert if something is missing.

## 2. LangSmith (AI traces)

n8n sends every AI call (chat model, embeddings, agent tool calls) to LangSmith when these settings are in the container environment. See [`n8n.env.example`](../n8n.env.example).

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://eu.api.smith.langchain.com
LANGCHAIN_API_KEY=<your key>
LANGCHAIN_PROJECT=brewtec-onboarding
```

Use the EU endpoint if your LangSmith account is in the EU. The wrong endpoint answers 404.

What we use it for:
- **Traces:** each question with the tool calls, retrieved chunks, latency and token count.
- **Alerts:** error rate and latency alerts posted to Discord.
- **Weekly scores:** workflow 7 saves its scores in the Supabase table `quality_checks`, so quality is visible over time. LangSmith shows the traces of those test questions.

## 3. Weekly answer quality (workflow 7)

Every Monday at 07:00: 10 golden questions, scored on source and key facts, saved in `quality_checks`, plus 5 real answers picked for a human to review. The report goes to Discord. The score rose from 30% (AI provider limits) to 90% after the reliability fixes.

## 4. Prometheus and Grafana

Everything is in [`monitoring/`](../monitoring). Start it with `docker compose up -d` in that folder.

| Service | Address |
|---|---|
| Grafana | `http://localhost:3001` (first login `admin` / `admin`, then change it) |
| Prometheus | `http://localhost:9090` |

n8n publishes its metrics at `/metrics` when these settings are on:

```
N8N_METRICS=true
N8N_METRICS_INCLUDE_WORKFLOW_ID_LABEL=true
N8N_METRICS_INCLUDE_MESSAGE_EVENT_BUS_METRICS=true
N8N_METRICS_INCLUDE_API_ENDPOINTS=true
```

Prometheus collects them every 15 seconds and keeps 30 days.

### Dashboard: BrewTec n8n operations

n8n is up · Active workflows · Successful and failed runs, last 24 h · Failure rate · Runs per hour · Failures per workflow · Run time (95th percentile) · Memory · Event loop lag.

Green is success, red is failure. Click a workflow in "Failures per workflow" to see which one is failing, then open its executions in n8n.

### Run time of one workflow (Grafana Explore)

Average run time of workflow 1 per successful run. In Grafana, Explore, data source Prometheus, Code mode. Use the workflow ID from the n8n address bar:

```
n8n_workflow_execution_duration_seconds_sum{workflow_id="cC0gucWeFDrENqmU", status="success"}
/
n8n_workflow_execution_duration_seconds_count{workflow_id="cC0gucWeFDrENqmU", status="success"}
```

Result on 2 Nov 2026: **17.7 s** per onboarding run, without the wait for HR approval ([screenshot](images/measured_workflow1_runtime.png), [query](images/measured_runtime_query.png)). Without the `workflow_id` filter the same query lists every workflow ([screenshot](images/measured_runtime_all_workflows.png)).

### Dashboard: BrewTec onboarding business view

Approved hires · Waiting for HR approval · Overdue tasks · Chat hand-offs, last 7 days · Hires per start month · Tasks per team · Day-1 readiness, next 30 days · Payroll forms · Assistant use per day · Automation steps per day.

It reads Supabase through the read-only role `grafana_reader`, created by [`sql/07_grafana_reporting.sql`](../sql/07_grafana_reporting.sql). That role sees only seven summary views in the `reporting` schema and never personal data. Test sessions (`qc-`) are excluded from the chat figures.

## 5. Daily checks for People Ops

| Where | What to look at |
|---|---|
| `#hr-helpdesk` | Hand-offs from the assistant, day-1 readiness (GREEN, AMBER, RED) |
| `#agent-dev-ops` | Workflow failures, health check alerts, weekly quality report |
| HR portal | Hires waiting for approval, rejected hires with the reason, payroll form status |
| Grafana | Failure rate above 5%, overdue tasks, readiness RED |
