// Node: Score answers  (Workflow 7, JavaScript, Run Once for All Items)
// Compares each reply with its expectation. Pairs replies with questions by position.
const HANDOFF_START = 'i could not find a reliable answer';
const qs = $('Golden questions').all().map(i => i.json);
const rs = $input.all().map(i => i.json);

const results = qs.map((q, i) => {
  const r = rs[i] || {};
  const reply = String(r.output ?? r.text ?? r.reply ?? '').trim();
  const low = reply.toLowerCase();
  let passed = false;
  let detail = '';
  if (!reply) {
    detail = 'no reply (' + String((r.error && (r.error.message || r.error)) || 'empty response').slice(0, 120) + ')';
  } else if (q.expect === 'handoff') {
    passed = low.startsWith(HANDOFF_START);
    detail = passed ? 'handed off as expected' : 'answered although no document covers it';
  } else if (low.startsWith(HANDOFF_START)) {
    detail = 'handed off although the document exists';
  } else if (!low.includes('[' + q.source)) {
    const cited = (reply.match(/\[[^\]]+\]/g) || []).join(' ') || 'none';
    detail = `wrong or missing source, cited ${cited}`;
  } else if (!(q.facts || []).some(f => low.includes(f))) {
    detail = 'right source, key fact missing (' + q.facts.join(' or ') + ')';
  } else {
    passed = true;
    detail = 'right source and key fact';
  }
  return { id: q.id, question: q.question, expected: q.expect === 'handoff' ? 'handoff' : q.source,
    reply: reply.slice(0, 1000), passed, detail };
});

const passedCount = results.filter(r => r.passed).length;
return [{ json: {
  total: results.length,
  passed: passedCount,
  score: Math.round(100 * passedCount / Math.max(results.length, 1)),
  failures: results.filter(r => !r.passed),
  results_json: JSON.stringify(results),
} }];
