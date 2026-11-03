# Architecture

How the BrewTec Employee Onboarding Journey Agent is built: the parts, how data moves between them, the data model and the main design decisions.

Related documents: [Workflows](WORKFLOWS.md) · [Security and governance](SECURITY_AND_GOVERNANCE.md) · [Testing](TESTING.md) · [Monitoring](MONITORING.md) · [Deployment](DEPLOYMENT.md)

## 1. Design principle

**The AI writes text. Code decides. People approve.**

| Decision | Made by |
|---|---|
| Is this hire valid (department, 14 days notice, no duplicate)? | Rules in a Code node |
| Which 25 tasks, for which team, due when? | Rules in a Code node |
| Welcome e-mail text | AI draft, checked by code, approved by HR |
| Does the e-mail go out? | HR, one click in Gmail |
| Answer to an employee question | AI, only from retrieved documents, checked by code |
| Who sees bank and tax details? | Payroll only, every view logged |

Employment is a high-risk area under the EU AI Act (Annex III). Keeping every decision about a person out of the AI is the core of the design.

## 2. System overview

```mermaid
flowchart LR
    subgraph People
        HR[HR People Ops]
        NH[New hire]
        PY[Payroll]
        TM[IT, Facilities, managers]
        EMP[All employees]
    end

    subgraph N8N[n8n 2.37 in Docker, 13 workflows]
        CORE[Onboarding core<br/>1 Intake and approval<br/>4 Daily scheduler<br/>8 Workday sync<br/>9 Mock Workday API]
        PORT[Self-service portals<br/>10 HR portal<br/>11 Payroll details form<br/>12 Payroll portal]
        ASSIST[Company assistant<br/>2 Knowledge base<br/>3 RAG chatbot<br/>5 Website]
        OPS[Operations and testing<br/>6 Error alerts<br/>7 Weekly quality check<br/>13 Automated tests]
    end

    subgraph Services
        SB[(Supabase<br/>Postgres, pgvector,<br/>pgcrypto, Vault)]
        AI[OpenRouter chat model<br/>Gemini embeddings]
        NO[Notion<br/>17 policy pages]
        GM[Gmail]
        DC[Discord]
        JI[Jira via MCP server<br/>IT and Facilities tickets]
        LS[LangSmith]
        GF[Prometheus and Grafana]
    end

    HR --> PORT
    NH --> PORT
    PY --> PORT
    EMP --> ASSIST
    CORE --> GM
    CORE --> DC
    CORE --> JI
    JI --> TM
    DC --> TM
    N8N --> SB
    CORE --> AI
    ASSIST --> AI
    NO --> ASSIST
    ASSIST --> LS
    OPS --> DC
    N8N --> GF
```

## 3. The whole flow (UML activity diagram)

One hire from HR entry to the payroll hand-over. Each lane is a role, dark boxes are where a person acts.

![UML activity diagram of the whole flow](images/uml_activity.png)

The same flow as a Mermaid diagram, which GitHub draws from text:

```mermaid
flowchart TB
    subgraph L1[HR People Ops]
        S((start)) --> A1[Enters hire in HR portal]
        R1[Reads the reason, decides]
        A4[Approves in Gmail]
    end
    subgraph L2[n8n agent]
        A2[Workday sync every 5 min] --> D1{Rules OK?}
        A3[AI draft, code check]
        A5[Welcome e-mail, laptop, account]
        A6[Posts 25 tasks to Discord]
        A7[Daily: form link 13 days before start]
        A9[Checks, encrypts, saves to Supabase]
    end
    subgraph L3[New hire]
        B1[Gets welcome and personal code]
        B2[Fills payroll form with code]
    end
    subgraph L4[IT, Facilities, manager]
        C1[Do their tasks before day 1]
    end
    subgraph L5[Payroll]
        P1[Opens record, view logged, hands to DATEV] --> E((end))
    end

    A1 --> A2
    D1 -- no --> R1
    D1 -- yes --> A3
    A3 --> A4
    A4 --> A5
    A5 --> B1
    A5 --> A6
    A6 --> C1
    A6 --> A7
    A7 --> B2
    B2 --> A9
    A9 --> P1
```

## 4. Data flows

Three flows share one database.

| Flow | Path |
|---|---|
| **Onboarding** | HR portal (10) → `hris_employees` → Workday report API (9) → Workday sync (8) → Intake (1): rules, AI draft, code check → HR approval in Gmail → welcome e-mail, laptop, account, Discord tasks, Jira tickets for IT and Facilities through the Jira MCP server (create issue only) |
| **Payroll data** | Daily scheduler (4) → single-use form link e-mail → Payroll form (11): checksums → `payroll_details` encrypted with the Vault key → Payroll portal (12): decrypt one record, log the view → DATEV hand-over |
| **Company assistant** | Notion (17 pages) → Ingestion (2), nightly → `handbook_documents` (about 97 chunks) → Website chat (5) → Assistant (3): input guard, AI agent with two tools, answer check → reply or hand-off to People Ops |

### HR approval (sequence)

```mermaid
sequenceDiagram
    participant WD as Workday sync (8)
    participant W1 as Intake (1)
    participant DB as Supabase
    participant AI as AI model
    participant HR as HR (Gmail)
    participant NH as New hire
    participant DC as Discord

    WD->>W1: completed hire
    W1->>DB: duplicate check
    W1->>W1: rules: department, notice, plan 25 tasks
    W1->>DB: insert employee and tasks
    W1->>AI: write welcome draft
    AI-->>W1: draft
    W1->>W1: code check: no money, salary or contract terms
    W1->>HR: approval e-mail, run waits
    HR-->>W1: Approve
    W1->>NH: welcome e-mail with personal code
    W1->>DB: reserve laptop, plan account
    W1->>DC: tasks for IT, Facilities, manager
```

### Company assistant (sequence)

```mermaid
sequenceDiagram
    participant U as Employee
    participant G as Input guard
    participant A as AI agent
    participant T as Tools
    participant C as Answer check
    participant P as People Ops (Discord)

    participant K as Answer cache

    U->>G: question
    G->>G: remove ID numbers, refuse other people's data,<br/>block prompt injection, fixed replies
    G->>K: same verified question in the last 7 days?
    alt cache hit
        K-->>U: cached answer with source, about 1 s, no AI call
    end
    G->>A: clean question (with the last 8 exchanges of this chat)
    A->>T: handbook_search or onboarding_status (needs code)
    T-->>A: documents or own tasks
    A-->>C: answer with source
    C->>C: source cited and retrieved, numbers in source,<br/>no ID numbers, max 250 words
    alt all checks pass
        C-->>U: answer with source chip
        C->>K: store if general (not personal, not health)
    else any check fails
        C->>P: hand-off with the question
        C-->>U: People Ops will answer
    end
```

### Memory, cache and chat storage

The assistant has three kinds of memory. Each has its own purpose and its own limit.

```mermaid
flowchart LR
    Q[Employee question] --> G[Input guard<br/>cleans the text]
    G --> K{Answer cache<br/>same question,<br/>last 7 days?}
    K -- hit --> R[Reply in about 1 s]
    K -- miss --> A[AI agent]
    M[(Chat memory<br/>last 8 exchanges<br/>of this chat)] <--> A
    A --> S[handbook_search<br/>every question]
    S --> A
    A --> C[Answer check]
    C -- passed, general --> K2[(answer_cache<br/>Supabase, 7 days)]
    C --> R
    G --> L[(chat_messages<br/>Supabase, cleaned,<br/>90 days)]
    C --> L
```

| | Chat memory | Answer cache | Chat log |
|---|---|---|---|
| **Purpose** | Follow a conversation | Answer repeated questions fast, without the AI | Audit, hand-offs, figures for HR |
| **Where** | n8n working memory (`Chat memory` node) | Supabase `answer_cache` | Supabase `chat_messages` |
| **Scope** | One chat window | Everyone | Everyone |
| **Limit** | Last 8 exchanges (8 questions and 8 answers) | Reused for 7 days (`cache_days`), deleted after 30 days | Deleted after 90 days (`chat_retention_days`) |
| **Lost when** | n8n restarts, or the user clicks **New** | The knowledge base is rebuilt after a Notion change | Retention clean-up in workflow 4 |

**When the cache answers:** the same words as an earlier question (capital letters and punctuation ignored), the earlier answer passed every check and cited a document, at least 4 words and at most 300 characters.

**Never cached:** hand-offs, health or other sensitive questions, questions with a personal code, answers about someone's own tasks, follow-ups that start with "and", "also", "what about", "und" or "aber", and test sessions (`qc-`).

**What the chat log stores:** the cleaned question, the reply, the cited source or `handoff: <reason>`, and the flags `handoff` and `blocked`. ID numbers become `[removed: personal data]`, e-mail addresses, phone numbers and codes become `[email]`, `[phone]` and `[code]`, health questions become `[personal health-related question, text not stored]`, and answers about someone's own tasks are not stored. Test sessions are not logged.

**Finding from testing:** in a long chat the agent sometimes answered from its chat memory without a new search. The answer check could not verify the answer (`no retrieval was recorded`) and handed it off, which is safe but unnecessary. Rule 1 of the system prompt now requires a new search for every question.

Useful queries:

```sql
-- All chat messages, newest first
select created_at, session_id, user_message, reply, sources, handoff, blocked
from chat_messages order by created_at desc;

-- Hand-offs with the reason
select created_at, user_message, sources from chat_messages
where handoff = true order by created_at desc;

-- Cached answers and how often they were reused
select question, sources, hits, created_at, last_hit_at
from answer_cache order by last_hit_at desc nulls last;
```

## 5. Data model

```mermaid
erDiagram
    hris_employees ||--o| workday_sync : "picked up"
    hris_employees ||--o| employees : "hris_id"
    employees ||--o{ onboarding_tasks : has
    employees ||--o{ automation_log : logs
    employees ||--o| assets : "laptop"
    employees ||--o| directory_accounts : "account"
    employees ||--o{ pfb_requests : "form links"
    employees ||--o| payroll_details : "encrypted"
    employees ||--o{ payroll_access_log : "views"

    hris_employees {
        text hris_id PK
        text first_name
        text department
        date start_date
        text status
    }
    workday_sync {
        text worker_id PK
        text sync_status
        text sync_note
    }
    employees {
        uuid id PK
        text access_code
        text department
        date start_date
        text status
    }
    onboarding_tasks {
        uuid id PK
        text task_key
        text owner_team
        date due_date
        timestamptz completed_at
    }
    payroll_details {
        uuid employee_id PK
        bytea iban_enc
        bytea tax_id_enc
        bytea sv_number_enc
        text iban_masked
    }
    pfb_requests {
        bigint id PK
        text token_hash
        timestamptz expires_at
        timestamptz used_at
    }
    payroll_access_log {
        bigint id PK
        text action
        text actor
    }
```

Other tables: `handbook_documents` (chunks with 3072-dimension Gemini embeddings), `chat_messages`, `answer_cache`, `code_attempts`, `quality_checks`, `automation_log`, `assets` (14 seeded laptops), `directory_accounts`.

Views: `onboarding_overview`, `workday_sync_overview`, and seven `reporting.*` views for Grafana (`hires_by_month`, `hire_status`, `task_progress`, `day1_readiness`, `payroll_forms`, `chat_daily`, `automation_daily`).

## 6. Key design decisions

| Decision | Why |
|---|---|
| **Mock Workday report API** (workflow 9) instead of the n8n form | In a real company hires start in the HR system. The mock copies the Workday custom report URL and needs a bearer token. Moving to a real tenant changes the URL and credential, not the logic |
| **Only `Successfully Completed` hires** start onboarding | Matches the Workday hire business process. `In Progress` waits for HR |
| **Rules in Code nodes**, not in the prompt | Readable, testable, same result every time |
| **Gmail send-and-wait** for approval | HR approves in the tool they already use. The run pauses until HR clicks |
| **Personal code** for the assistant | An employee only sees their own tasks. Lockout after wrong tries |
| **pgcrypto AES-256 with the key in Supabase Vault** | Bank and tax data are never stored in clear text and never pass through the AI, Discord, LangSmith or n8n execution logs |
| **HMAC-signed (Hash-based Message Authentication Code) page tokens** on HR and payroll portals | n8n serves webhook pages in a sandbox, so origin checks fail. Signed tokens stop forged form posts |
| **Knowledge base rebuild with run id** | New chunks are written first, old ones deleted only after success, so the assistant is never empty |
| **OpenRouter for chat, Gemini for embeddings** | Gemini free tier rate limits made the assistant slow (24 to 33 s). OpenRouter brought it to about 2.7 s |

## 7. Scaling and production path

| Today (capstone) | Production |
|---|---|
| n8n on a laptop in Docker, public link through trycloudflare | Always-on server in Germany with HTTPS, see [Deployment](DEPLOYMENT.md) |
| Basic Auth for HR and payroll | Company single sign-on |
| Mock Workday API | Real Workday tenant through an integration system user (OAuth) |
| Free AI tiers | Paid tier with a fallback model |
| Manual retention | Automatic deletion of payroll details after the legal retention period |
| The AI decides when to search the knowledge base | A fixed search step before the AI on every question, see [Improvement plan](IMPROVEMENT_PLAN.md) |
| Notion knowledge base | SharePoint Online through Microsoft Graph |
