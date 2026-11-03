// Node: Test cases  (Workflow 13, JavaScript, Run Once for All Items)
// Reads the uploaded test file (CSV, comma or semicolon, UTF-8, header row) and turns every row into a test.
// Columns: test_id, category, kind, question, expected_start, source, facts, match, german, repeat, active, note, session
// session (optional): rows with the same session value run in ONE chat, in file order, to test multi-turn chats.
// Kinds:
//   fixed    reply starts with expected_start (guard texts, no AI involved)
//   answer   AI answer that cites a file whose name starts with source, optionally with one of the facts (separated by |)
//   german   like answer, and the reply must be in German
//   handoff  the assistant hands the question to People Ops instead of guessing
//   contains reply matches the regular expression in match
//   any      any normal reply without an error (robustness tests)
// Sessions start with qc- so the assistant does not cache them and does not post hand-offs to Discord.
const KINDS = ['fixed', 'answer', 'german', 'handoff', 'contains', 'any'];
const run = String($execution.id);
const fileName = String($('Upload test file').first().json.tests?.filename || $('Upload test file').first().binary?.tests?.fileName || 'uploaded file');

let text = String($('Read test file').first().json.data ?? '');
text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
if (!text.trim()) throw new Error('The uploaded file is empty.');

// Comma or semicolon (German Excel saves CSV with semicolons)
const headerLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
const sep = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';

// CSV parser with quotes, doubled quotes and line breaks inside quotes
function parse(src) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

const rows = parse(text);
if (rows.length < 2) throw new Error('The test file needs a header row and at least one test.');
const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
if (!header.includes('test_id') || !header.includes('kind') || !header.includes('question')) {
  throw new Error('The test file needs at least the columns test_id, kind and question. Found: ' + header.join(', '));
}
const yes = v => ['true', 'yes', 'ja', '1', 'x'].includes(String(v || '').trim().toLowerCase());

const tests = [];
const skipped = [];
for (const values of rows.slice(1)) {
  const r = {};
  header.forEach((h, i) => { r[h] = values[i] ?? ''; });
  const id = String(r.test_id || '').trim();
  if (!id) continue;
  if (r.active !== undefined && String(r.active).trim() !== '' && !yes(r.active)) continue;
  const kind = String(r.kind || '').trim().toLowerCase();
  if (!KINDS.includes(kind)) { skipped.push(`${id}: unknown kind "${r.kind}"`); continue; }
  if (kind === 'fixed' && !r.expected_start) { skipped.push(`${id}: fixed needs expected_start`); continue; }
  if ((kind === 'answer' || kind === 'german') && !String(r.source || '').trim()) { skipped.push(`${id}: ${kind} needs source`); continue; }
  if (kind === 'contains') {
    if (!r.match) { skipped.push(`${id}: contains needs match`); continue; }
    try { new RegExp(r.match, 'i'); } catch (e) { skipped.push(`${id}: match is not a valid pattern`); continue; }
  }
  const times = Math.min(Math.max(parseInt(r.repeat, 10) || 1, 1), 100);
  const base = String(r.question ?? '');
  const facts = String(r.facts || '').split('|').map(s => s.trim()).filter(Boolean);
  tests.push({
    id,
    category: String(r.category || '').trim() || 'General',
    question: base.trim() === '' ? '   ' : base.repeat(times),
    kind,
    start: String(r.expected_start || '').trim(),
    source: String(r.source || '').trim(),
    facts: facts.length ? facts : undefined,
    match: String(r.match || ''),
    german: yes(r.german) || kind === 'german',
    note: String(r.note || '').trim(),
    session: String(r.session || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30),
  });
}
if (!tests.length) throw new Error('No runnable tests in the file.' + (skipped.length ? ' Skipped: ' + skipped.join('; ') : ''));

return tests.map((t, i) => ({ json: { ...t, sessionId: t.session ? `qc-test-${run}-s-${t.session}` : `qc-test-${run}-${i + 1}`,
  skipped: i === 0 ? skipped : [], file_name: i === 0 ? fileName : '' } }));
