# Testing

How the agent was tested, how to run the tests yourself and what the results were. Test files are in [`test_pack/`](../test_pack).

## 1. Test pack

| File | Content | Count |
|---|---|---|
| `functional_tests.csv` | Functional tests: intake, approval, Workday, HR portal, payroll form and portal, chatbot, privacy | |
| `reliability_tests.csv` | Reliability tests: error alerts, empty input, rate limits, AI outage, duplicates, retries, cache | |
| `chatbot_tests_core.csv` | The 39 chatbot tests run by workflow 13 | 39 |
| `chatbot_tests_template.csv` | Empty template for your own chatbot tests | |
| `chatbot_tests_multi_turn.csv` | Questions in 3 chats (column `session`) to test longer conversations | 10 |
| `scenario_test_results.csv` | The 26 scenario tests with results, see [Scenario tests](SCENARIO_TESTS.md) | 26 |
| `live_demo_scenarios.csv` | Live end-to-end run sheet for the demo, results to fill in | 10 |
| `kb_questions.csv` | 20 knowledge base questions with the expected source and key fact | 20 |
| `test_hires.csv` | Valid (H1 to H5) and invalid (N1 to N4) test hires | 9 |
| `time_saved_hires.csv` | Five hires for the time-saved measurement | 5 |
| `verification_checks.sql` | Verification queries and the test data reset | |
| `TEST_ROUND_CHECKLIST.md` | The manual test round, grouped by tool | |

## 2. Automated chatbot tests (workflow 13)

Upload a CSV and get the results by e-mail as an Excel file. No code change is needed to add or change tests.

1. Open the form URL of workflow 13 (Form trigger `Upload test file`).
2. Upload `test_pack/chatbot_tests_core.csv` or your own file in the same format.
3. Wait about 8 minutes. The assistant gets one question every 10 seconds, below its rate limit. Don't use the chatbot at the same time.
4. Results: the score in Discord, and an Excel file by e-mail with a summary sheet and one sheet per category.

### CSV format

| Column | Meaning |
|---|---|
| `test_id` | For example `KB01` |
| `category` | Sheet name in the Excel file, for example `Knowledge base` |
| `kind` | `fixed`, `answer`, `german`, `handoff`, `contains` or `any` (see below) |
| `question` | What is sent to the assistant |
| `expected_start` | For `fixed`: the reply must start with this text |
| `source` | For `answer` and `german`: the cited file name must start with this |
| `facts` | Optional key facts, separated by `\|`. One of them must appear in the answer |
| `match` | For `contains`: a regular expression the reply must match |
| `german` | `yes` if the reply must be in German |
| `repeat` | Repeat the question text this many times (used for the over-long input test) |
| `active` | `no` skips the row |
| `note` | Free text, shown in the report |
| `session` | Optional. Rows with the same value run in one chat, in file order |

| Kind | Passes when |
|---|---|
| `fixed` | The reply starts with `expected_start` (guard texts, no AI) |
| `answer` | The AI answer cites the right file, and one of the facts if given |
| `german` | Like `answer`, and the reply is in German |
| `handoff` | The assistant hands the question to People Ops instead of guessing |
| `contains` | The reply matches the pattern in `match` |
| `any` | Any normal reply without an error (robustness tests) |

Only `test_id`, `kind` and `question` are required. Comma or semicolon separators both work, so a file saved from German Excel is fine. Unknown kinds or missing fields are listed as skipped in the report. Test sessions start with `qc-`, so they are not cached and do not post hand-offs to Discord.

### Results

| Run | Passed | What changed |
|---|---|---|
| 1 | 36 of 39 (92%) | First run |
| 2 and 3 | 38 of 39 (97%) | Two wrong test expectations corrected (KB14, R42), mixed question KB11 found a prompt gap |
| 4 | 39 of 39 (100%) | Prompt rule 5 rewritten, citation bug fixed |
| 5 | 39 of 39 (100%) | Run 12681, 29 Oct 2026, through the CSV upload |

**Bug found by the tests:** when the AI cited two files in one bracket, `[a.md, b.md]`, the answer check read it as one unknown file and handed off a correct answer. Fixed in the answer check (workflow 3) and in the source chips on the website (workflow 5).

## 3. Weekly quality check (workflow 7)

Ten golden questions every Monday, scored on source and key facts, with 5 real answers for human review. The score went from 30% (AI provider limits) to 90% after the fixes. Scores are saved in `quality_checks` in Supabase.

## 4. Manual and end-to-end tests

| Area | Status |
|---|---|
| Functional tests | Tested manually, results recorded with screenshots |
| Reliability tests | Tested manually, results recorded with screenshots |
| End to end, Clara Neumann | Passed: HR portal, Workday sync, approval, onboarding, form link, encrypted submit, payroll transfer |
| Workday API | 401 without token, 8 of 8 test hires classified correctly |

Key results:

| Test | Proves |
|---|---|
| TC45 | New hire can submit bank and tax details |
| TC46 | The form link works only once |
| TC50 | HR sees only a masked IBAN |
| TC51 | Payroll opens one record, decrypted and logged |
| TC52 | Payroll marks the DATEV transfer |
| TC53 | Details stored encrypted |

## 5. Before every release

1. Run workflow 13 with `chatbot_tests_core.csv`. Expect 39 of 39.
2. Run workflow 7 once. Expect 90% or more.
3. Submit one valid and one invalid test hire in the HR portal.
4. Check `#agent-dev-ops` in Discord for error alerts.
