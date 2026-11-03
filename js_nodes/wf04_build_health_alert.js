// Node: Build health alert  (Workflow 4, JavaScript, Run Once for All Items)
// Daily health check. Posts to #hr-helpdesk only when something needs a human.
// Returns no item (nothing posted) on a healthy day.
const h = $input.first().json || {};
const n = v => Number(v || 0);
const issues = [];

if (n(h.stale_approvals) > 0)
  issues.push(`${n(h.stale_approvals)} hire(s) waiting more than 2 days for HR approval: ${h.stale_names}. Open the approval email or send it back.`);
if (n(h.ai_failures_24h) >= 3)
  issues.push(`The assistant could not reach Gemini ${n(h.ai_failures_24h)} times in 24 hours (rate limit or outage). Check the API quota.`);
if (n(h.handoffs_24h) >= 5)
  issues.push(`${n(h.handoffs_24h)} questions were handed off in 24 hours. Check #hr-helpdesk for missing policies and add them in Notion.`);
if (n(h.kb_chunks) < 10)
  issues.push(`The knowledge base holds only ${n(h.kb_chunks)} chunks. Run workflow 2 (Run ingestion).`);
if (h.last_quality_score !== null && h.last_quality_score !== undefined && n(h.last_quality_score) < 80)
  issues.push(`The last weekly quality check scored ${n(h.last_quality_score)}%, below the 80% pass mark. Review the failed questions.`);
if (n(h.days_since_quality_check) > 8)
  issues.push(`The weekly quality check has not run for ${n(h.days_since_quality_check)} days. Check that workflow 7 is published.`);

if (!issues.length) return [];
let msg = '**Onboarding agent health check: action needed**\n' + issues.map(i => '- ' + i).join('\n');
if (msg.length > 1900) msg = msg.slice(0, 1897) + '...';
return [{ json: { message: msg, issue_count: issues.length } }];
