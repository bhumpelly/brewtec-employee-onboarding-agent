// Node: Answer check  (Workflow 3, JavaScript, Run Once for All Items)
// Output guardrail. Fail closed: an AI answer is shown only if every check passes. Otherwise it
// becomes a hand-off to People Ops with the reason. Checks on AI answers:
//  1. The agent did not say HANDOFF (company question the documents do not cover).
//     OFFTOPIC (not a work question) gets a fixed reply and no hand-off.
//  2. No personal identifier (tax ID, IBAN, social security number) in the answer.
//  3. No internal instructions or tool names (prompt leakage).
//  4. It cites a knowledge base file, [onboarding status] or [code needed].
//     Several files in one bracket, [a.md, b.md], count as separate citations.
//  5. At most 250 words.
//  6. Every cited file was actually returned by handbook_search in this run.
//  7. [onboarding status] only after onboarding_status was actually called.
//  8. Every number with 2+ digits (or a decimal) appears in the retrieved text.
//  9. Every e-mail address outside brewtec.de appears in the retrieved text.
// Checks 6 to 9 use the agent's recorded tool calls. verify_citations = false in Config
// switches 6 to 8 off (fallback if the n8n version does not return tool calls).
// It also decides what may be stored: personal onboarding answers are not written to the chat
// log, and only verified, non-personal answers go into the answer cache.
const PII_PATTERNS = [
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/i,
  /(?<!\d)\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}(?!\d)/i,
  /\b\d{2}[ ]?\d{6}[ ]?[A-Z][ ]?\d{3}\b/i,
];
const LEAK = /you are the brewtec company assistant|rules:\s*1\.|\bhandbook_search\b|\bonboarding_status\b|system ?(prompt|message)|systemnachricht/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const T = {
  handoff: [
    'I could not find a reliable answer in the BrewTec documents, so I did not guess. ' +
    'I passed your question to People Ops in the HR helpdesk channel. You can also write to people@brewtec.de.',
    'Ich habe in den BrewTec-Dokumenten keine verlässliche Antwort gefunden und deshalb nicht geraten. ' +
    'Ich habe deine Frage an People Ops im HR-Helpdesk weitergegeben. Du kannst auch an people@brewtec.de schreiben.'],
  off_topic: [
    'I can only help with BrewTec topics, for example HR, IT, finance, facilities and onboarding. ' +
    'For other questions please use another source. What would you like to know about BrewTec?',
    'Ich kann nur bei BrewTec-Themen helfen, zum Beispiel HR, IT, Finanzen, Facilities und Onboarding. ' +
    'Für andere Fragen nutze bitte eine andere Quelle. Was möchtest du über BrewTec wissen?'],
};
const MAX_WORDS = 250;
const NOT_STORED = '[personal onboarding status, not stored]';
const ref = String($execution.id);

function numbersIn(text) {
  return [...new Set((text.match(/\d+(?:[.,]\d+)?/g) || []).filter(n => n.length >= 2 || /[.,]/.test(n)))];
}

return $input.all().map(item => {
  const j = item.json;
  const session = j.sessionId || 'no-session';
  const question = String(j.safe_input ?? '');
  const logQuestion = String(j.log_input ?? question);
  const lang = (j.german === true || j.german === 'true') ? 1 : 0;
  const isQualityCheck = session.startsWith('qc-');
  const base = { sessionId: session, user_message: logQuestion, cache_key: '', cacheable: false,
    cache_question: '', notify: false, discord_message: '' };

  // Fixed replies: input guard (small talk, empty, too long, personal data, manipulation,
  // off topic) and route (answer cache, circuit breaker, session limit, busy)
  if (j.skip_ai === true || j.skip_ai === 'true') {
    const kind = j.reply_kind || (j.blocked ? 'pii' : 'small talk');
    const reply = String(j.reply ?? '');
    return { json: { ...base, reply, log_reply: reply,
      sources: kind === 'cache' ? 'cache: ' + (j.cached_sources || '') : kind,
      handoff: false, blocked: kind === 'pii' || kind === 'manipulation',
      check: kind === 'cache' ? 'cache hit' : 'fixed reply' } };
  }

  const answer = String(j.output ?? '').trim();
  const files = [...new Set([...answer.matchAll(/\[([^\]]+)\]/g)].flatMap(m => m[1].split(/[,;]/)).map(s => s.trim()).filter(s => /^[a-z0-9][a-z0-9\-_.]*\.md$/i.test(s)))].sort();
  const lower = answer.toLowerCase();
  const statusCited = lower.includes('[onboarding status]');
  const codeNeeded = lower.includes('[code needed]');
  const words = answer.split(/\s+/).filter(Boolean).length;
  const verify = String(j.verify_citations ?? 'true').toLowerCase() !== 'false';
  const steps = String(j.steps ?? '');
  const stepsRecorded = steps.length > 4 && steps !== '[]';

  // Not a work question: fixed reply, no hand-off, nothing for People Ops to do
  if (answer.toUpperCase().startsWith('OFFTOPIC')) {
    return { json: { ...base, reply: T.off_topic[lang], log_reply: T.off_topic[lang],
      sources: 'off_topic', handoff: false, blocked: false, check: 'off topic (AI)' } };
  }

  const foreignEmails = (answer.match(EMAIL) || [])
    .filter(e => !/@brewtec\.de$/i.test(e) && !steps.toLowerCase().includes(e.toLowerCase()));

  let reason = '';
  if (!answer || answer.toUpperCase().startsWith('HANDOFF')) reason = 'agent said HANDOFF';
  else if (PII_PATTERNS.some(p => p.test(answer))) reason = 'answer contained a personal identifier';
  else if (LEAK.test(answer)) reason = 'answer revealed internal instructions';
  else if (!(files.length || statusCited || codeNeeded)) reason = 'no cited source';
  else if (words > MAX_WORDS) reason = `answer too long (${words} words)`;
  else if (foreignEmails.length) reason = 'e-mail address not in the sources: ' + foreignEmails.join(', ');
  else if (verify && (files.length || statusCited)) {
    if (!stepsRecorded) {
      reason = 'answer could not be verified: no retrieval was recorded';
    } else {
      const notRetrieved = files.filter(f => !steps.includes(f));
      if (notRetrieved.length) reason = 'cited a document that was not retrieved: ' + notRetrieved.join(', ');
      else if (statusCited && !steps.includes('onboarding_status')) reason = 'status answer without a status lookup';
      else {
        const body = answer.replace(/\[[^\]]*\]/g, ' ');
        const unsupported = numbersIn(body).filter(n =>
          ![n, n.replace(',', '.'), n.replace('.', ',')].some(v => steps.includes(v)));
        if (unsupported.length) reason = 'numbers not found in the sources: ' + unsupported.join(', ');
      }
    }
  }

  const handoff = reason !== '';
  const notify = handoff && !isQualityCheck;
  const sources = [...files, ...(statusCited ? ['onboarding status'] : [])].join(', ');
  const personal = statusCited || codeNeeded;
  const cacheable = !handoff && !personal && files.length > 0 && !!j.cache_key && !isQualityCheck;
  const reply = handoff ? T.handoff[lang] : answer;
  return { json: {
    ...base,
    reply,
    // Personal onboarding answers (name, tasks, device) are shown but not stored
    log_reply: !handoff && statusCited ? NOT_STORED : reply,
    sources: handoff ? 'handoff: ' + reason : sources,
    handoff,
    notify,
    blocked: false,
    check: handoff ? reason : 'passed',
    cacheable,
    cache_key: cacheable ? j.cache_key : '',
    cache_question: cacheable ? question.slice(0, 500) : '',
    discord_message: notify
      ? `**Hand-off from the company assistant**\nQuestion: ${logQuestion.slice(0, 1400)}\nReason: ${reason}\nReference: ${ref}`
      : '',
  } };
});
