# Improvement plan: the assistant skips the search in longer chats

## The failure

In a chat with several questions, the company assistant (workflow 3) sometimes answers a later question without calling `handbook_search`. It writes the answer from what is already in the chat memory (the last 8 exchanges).

The output guard catches this. `Answer check` requires a recorded search for every cited file, finds none, and replaces the answer with a hand-off: "I could not find a reliable answer", reason `answer could not be verified: no retrieval was recorded`. So employees never see an unverified answer, but they get a hand-off for a question the documents do answer, and People Ops gets a needless ticket in `#hr-helpdesk`.

**Evidence:** chatbot round 2 tests, KB03 inside a longer chat was handed off with this reason, and the same question passed when asked again in a new chat. The 39 automated tests did not catch it, because workflow 13 gave every question its own new chat.

This is the failure we rank first because it hits the most common real use: an employee asking two or three questions in one visit. A safety failure (salary to a wrong account, see [Responsible AI](RESPONSIBLE_AI.md#6-the-failure-that-would-matter-most)) would matter more if it happened, but it depends on a human typo or a hacked mailbox, and it is handled by payroll process, not by the agent.

## Root cause

Calling the search is the model's choice. The AI agent decides on every turn which tool to call. With earlier answers and their source names already in memory, the model treats a new question as covered and skips the tool. Rule 1 of the prompt said "call handbook_search first" for "every company question", which the model read as satisfied by the first search of the chat. Nothing in the flow forced a search per question, only the guard after the fact.

## Fix

**Step 1, done: make the rule explicit per question.** Rule 1 now ends with: "Search again for every new question, even if a similar question was answered earlier in this chat. Never answer from earlier messages without a new search." This targets the exact misreading: the model applied "first" to the chat, not to each question.

**Step 2, done: test multi-turn chats.** Workflow 13 had no way to send several questions in one chat. The `Test cases` node now reads an optional `session` column: rows with the same value run in one chat, in file order. [`chatbot_tests_multi_turn.csv`](../test_pack/chatbot_tests_multi_turn.csv) has 10 questions in 3 chats that switch topic, department and language, plus one question that must still hand off. This proves the fix and stops it from coming back unnoticed after a prompt or model change.

**Step 3, version 2: take the choice away from the model.** Run the search as a fixed node before the agent on every question, and pass the results in with the question. The agent then has nothing to skip. The answer check stays as it is. This is the structural fix. Steps 1 and 2 reduce and measure the failure, step 3 removes its cause.

Why not only reduce the memory window: memory is needed for real follow-ups ("and for part-time?"). Shorter memory would make those worse without forcing the search.

## Two production metrics

Both come from the Supabase table `chat_messages`, which stores every reply with its `sources` field and is kept 90 days.

**Metric 1: unverified-answer hand-off rate.** Share of AI-routed replies handed off because no search was recorded. Should be close to 0% after the fix. A rise after a model or prompt change means the failure is back.

```sql
select date_trunc('week', created_at) as week,
       round(100.0 * count(*) filter (where sources like 'handoff: answer could not be verified%')
             / nullif(count(*) filter (where sources not in ('small talk','empty','too_long','off_topic','pii',
               'manipulation','other_person_data','breaker','session_limit','busy')
               and sources not like 'cache:%' and sources not like 'ai unavailable%'), 0), 1) as unverified_pct
from chat_messages
where coalesce(session_id, '') not like 'qc-%'
group by 1 order by 1;
```

**Metric 2: hand-off rate by turn number.** Hand-off rate of the first question in a chat compared with the second and later questions. Before the fix, later turns hand off more often. If the fix works, the two rates are about equal, because a later question is no harder than a first one.

```sql
with t as (
  select handoff, row_number() over (partition by session_id order by created_at) as turn
  from chat_messages
  where coalesce(session_id, '') not like 'qc-%' and not blocked
    and sources not in ('small talk','empty','too_long','off_topic')
)
select case when turn = 1 then 'first question' else 'later questions' end as turn_group,
       count(*) as replies,
       round(100.0 * avg(handoff::int), 1) as handoff_pct
from t group by 1 order by 1;
```

Test-side check: the multi-turn test file in workflow 13 should pass 10 of 10. Any failure with the detail "handed off although a document covers it" is this failure.

## Scope

| Now, in this module | Version 2 |
|---|---|
| Rule 1 sentence (done in the repository, to be applied in n8n) | Fixed search node before the agent, so retrieval cannot be skipped |
| `session` column in workflow 13 and the multi-turn test file (done in the repository) | Add both SQL metrics as panels to the Grafana HR business view, with an alert when metric 1 is above 2% in a week |
| Run the multi-turn file once and record the score (done: 10 of 10, run 13515, 3 Nov 2026) | Re-run the multi-turn file automatically after every model or prompt change |
| Run both SQL queries on the current chat log for a baseline | Compare the two numbers 4 weeks after go-live |

Steps 1 and 2 fit in the remaining time. Step 3 changes how the agent is wired and needs a full re-test of all 39 + 10 chatbot tests, so it is planned for version 2.
