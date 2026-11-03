// Node: Check replies  (Workflow 13, JavaScript, Run Once for All Items)
// Compares every reply with the expectation of its test. Replies are paired with tests by position.
// Result per test: pass, fail, or retry (the assistant was busy or rate limited, run that test again).
const HANDOFF_START = 'i could not find a reliable answer';
const BUSY = /many colleagues are using the assistant|temporarily unavailable|you are sending questions very quickly|gerade nutzen viele|nicht verfügbar|sehr schnell viele fragen/i;
const GERMAN = /\b(ich|du|sie|und|der|die|das|ist|nicht|bitte|nach|mit|für|über|eine?n?|werden|kannst|musst)\b/i;

const tests = $('Test cases').all().map(i => i.json);
const runAt = $now.setZone('Europe/Berlin').toFormat('yyyy-MM-dd HH:mm');
const runId = String($execution.id);
const replies = $input.all().map(i => i.json);

const results = tests.map((t, i) => {
  const r = replies[i] || {};
  const reply = String(r.output ?? r.text ?? r.reply ?? '').trim();
  const low = reply.toLowerCase();
  const cites = [...reply.matchAll(/\[([^\]]+)\]/g)].flatMap(m => m[1].split(/[,;]/).map(x => '[' + x.trim() + ']'));
  const handoff = low.startsWith(HANDOFF_START);
  let result = 'fail';
  let detail = '';

  if (!reply) {
    detail = 'no reply (' + String((r.error && (r.error.message || r.error)) || 'empty response').slice(0, 120) + ')';
  } else if (BUSY.test(reply) && t.kind !== 'fixed') {
    result = 'retry';
    detail = 'assistant busy or rate limited, run this test again';
  } else if (t.kind === 'fixed') {
    const ok = low.startsWith(t.start.toLowerCase());
    result = ok ? 'pass' : 'fail';
    detail = ok ? 'fixed reply as expected' : `expected a reply starting "${t.start}"`;
  } else if (t.kind === 'handoff') {
    result = handoff ? 'pass' : 'fail';
    detail = handoff ? 'handed off, nothing invented' : 'answered although it should hand off';
  } else if (t.kind === 'answer' || t.kind === 'german') {
    const rightSource = cites.some(c => c.toLowerCase().startsWith('[' + t.source));
    const factOk = !(t.facts && t.facts.length) || t.facts.some(f => low.includes(f.toLowerCase()));
    const langOk = t.kind !== 'german' || GERMAN.test(reply);
    if (handoff) detail = 'handed off although a document covers it';
    else if (!rightSource) detail = `wrong or missing source, cited ${cites.join(' ') || 'none'}`;
    else if (!factOk) detail = `right source, key fact missing (${t.facts.join(' or ')})`;
    else if (!langOk) detail = 'right source, but the reply is not in German';
    else { result = 'pass'; detail = 'right source' + (t.facts ? ' and key fact' : '') + (t.kind === 'german' ? ', in German' : ''); }
  } else if (t.kind === 'contains') {
    const ok = new RegExp(t.match, 'i').test(reply);
    result = ok ? 'pass' : 'fail';
    detail = ok ? (t.note || 'expected content found') : `expected: ${t.note || t.match}`;
  } else {
    const langOk = !t.german || GERMAN.test(reply);
    result = langOk ? 'pass' : 'fail';
    detail = langOk ? `normal reply, no error${handoff ? ' (hand-off)' : cites.length ? ' (with source)' : ''}` : 'reply not in German';
    if (t.note) detail += `. Note: ${t.note}`;
  }

  return {
    run_at: runAt,
    run_id: runId,
    id: t.id,
    category: t.category || 'General',
    question: t.question.length > 80 ? t.question.slice(0, 77) + '...' : t.question,
    expected: t.kind === 'fixed' ? `fixed: ${t.start}` : t.kind === 'answer' || t.kind === 'german' ? `answer from ${t.source}` : t.kind === 'contains' ? (t.note || t.match) : t.kind,
    result,
    detail,
    reply: reply.replace(/\s+/g, ' ').slice(0, 400),
  };
});

return results.map(r => ({ json: r }));
