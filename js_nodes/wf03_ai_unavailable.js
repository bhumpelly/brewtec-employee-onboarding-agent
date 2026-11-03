// Node: AI unavailable  (Workflow 3, JavaScript, Run Once for All Items)
// Runs only on the error output of Company assistant, after its 3 retries have failed.
// The employee gets a clear message instead of a server error: what happened, whether it was
// their fault, what to do now, and a reference number. The technical detail goes only to the
// log (automation_log), where the reference finds it again. Three types:
//   rate_limit  too many requests or quota (Gemini free tier)
//   timeout     the model took too long
//   outage      anything else: service down, network, wrong credential
const g = $('Input guard').first().json;
const ref = String($execution.id);
const lang = g.german ? 1 : 0;

const T = {
  rate_limit: [
    `Many colleagues are asking at the moment, so I could not answer. This is not a problem with your question. Please try again in about 1 minute. Reference: ${ref}`,
    `Gerade stellen viele Kolleginnen und Kollegen Fragen, deshalb konnte ich nicht antworten. Das liegt nicht an deiner Frage. Bitte versuche es in etwa 1 Minute noch einmal. Referenz: ${ref}`],
  timeout: [
    `Your question took too long to answer. Please try again, or split it into shorter questions. Reference: ${ref}`,
    `Die Antwort hat zu lange gedauert. Bitte versuche es noch einmal oder teile die Frage in kürzere Fragen auf. Referenz: ${ref}`],
  outage: [
    `The assistant is temporarily unavailable. Our team has been notified. For anything urgent, write to people@brewtec.de and mention reference ${ref}.`,
    `Der Assistent ist vorübergehend nicht verfügbar. Unser Team ist informiert. Bei dringenden Fragen schreib an people@brewtec.de mit der Referenz ${ref}.`],
};

function classify(text) {
  const t = text.toLowerCase();
  if (/(429|too many requests|rate.?limit|quota|resource.?exhausted)/.test(t)) return 'rate_limit';
  if (/(timeout|timed out|etimedout|deadline exceeded|504)/.test(t)) return 'timeout';
  return 'outage';
}

return $input.all().map(item => {
  const e = item.json.error;
  const detail = typeof e === 'string' ? e : (e && (e.message || e.description)) || item.json.message || 'unknown error';
  const type = classify(String(detail));
  return { json: {
    sessionId: g.sessionId,
    user_message: g.log_input ?? g.safe_input,
    reply: T[type][lang],
    log_reply: T[type][lang],
    sources: 'ai unavailable: ' + type,
    handoff: false,
    notify: false,
    blocked: false,
    cacheable: false,
    cache_key: '',
    cache_question: '',
    check: 'ai unavailable',
    error_type: type,
    error_detail: `${type} | ref ${ref} | ${String(detail)}`.slice(0, 500),
  } };
});
