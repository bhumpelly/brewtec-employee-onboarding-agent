// Node: Build report  (Workflow 7, JavaScript, Run Once for All Items)
// Weekly report for People Ops: automatic score, failed questions, and 5 real answers
// from the past week for a human to check against the cited documents.
const s = $('Score answers').first().json;
const passMark = Number($('Config').first().json.pass_mark || 80);
const samples = $input.all().map(i => i.json).filter(r => r.question);

const lines = [];
lines.push(`**Weekly answer quality check: ${s.score}% (${s.passed} of ${s.total})**`);
lines.push(s.score >= passMark
  ? `At or above the ${passMark}% pass mark.`
  : `BELOW the ${passMark}% pass mark. Review the failures before employees rely on the assistant.`);
if (s.failures.length) {
  lines.push('Failed:');
  for (const f of s.failures) lines.push(`- ${f.id} ${f.question} -> ${f.detail}`);
}
if (samples.length) {
  lines.push('', 'Human review: check these real answers from the last 7 days against the cited documents:');
  samples.forEach((r, i) => lines.push(`${i + 1}. Q: ${r.question}\n   A: ${r.answer} (${r.sources || 'no source'})`));
}
let msg = lines.join('\n');
if (msg.length > 1900) msg = msg.slice(0, 1897) + '...';
return [{ json: { discord_message: msg, score: s.score, below_pass_mark: s.score < passMark } }];
