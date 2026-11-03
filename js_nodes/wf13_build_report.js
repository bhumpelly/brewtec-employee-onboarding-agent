// Node: Build report  (Workflow 13, JavaScript, Run Once for All Items)
// One short Discord message for #brewtec-agent-dev-ops with the score and every test that did not pass.
const rows = $input.all().map(i => i.json);
const passed = rows.filter(r => r.result === 'pass').length;
const retry = rows.filter(r => r.result === 'retry');
const failed = rows.filter(r => r.result === 'fail');
const scored = rows.length - retry.length;
const score = scored ? Math.round(100 * passed / scored) : 0;

const file = $('Test cases').first().json.file_name || '';
const lines = [`**Automated chatbot tests: ${passed} of ${scored} passed (${score}%)**` + (file ? ` · ${file}` : '')];
const cats = [...new Set(rows.map(r => r.category || 'General'))];
lines.push(cats.map(c => { const g = rows.filter(r => (r.category || 'General') === c); return `${c}: ${g.filter(r => r.result === 'pass').length}/${g.length}`; }).join(' · '));
if (retry.length) lines.push(`Not scored, assistant was busy: ${retry.map(r => r.id).join(', ')}`);
const skipped = ($('Test cases').first().json.skipped || []);
if (skipped.length) lines.push(`Skipped, check the row in chatbot_test_cases: ${skipped.join('; ')}`);
if (failed.length) {
  lines.push('Failed:');
  for (const f of failed) lines.push(`- ${f.id} ${f.question} -> ${f.detail}`);
} else {
  lines.push('No failures.');
}
let msg = lines.join('\n');
if (msg.length > 1900) msg = msg.slice(0, 1897) + '...';
return [{ json: { discord_message: msg, total: rows.length, passed, failed: failed.length, retry: retry.length, score } }];
