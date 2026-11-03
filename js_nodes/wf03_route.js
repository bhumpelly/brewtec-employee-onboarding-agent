// Node: Route  (Workflow 3, JavaScript, Run Once for All Items)
// Decides, before any AI call, whether the question needs the AI at all. Order:
//  1. Answer cache: the same question was answered and verified recently, so reply from the cache.
//  2. Circuit breaker: the AI failed repeatedly in the last minutes, so reply at once instead of
//     making the user wait through retries that will fail too.
//  3. Session limit: one chat sends many questions per minute (misuse or a stuck script).
//  4. Overall limit: many questions per minute in total, so the Gemini rate limit is close.
// If the pre-check query failed (database unreachable), the question simply goes to the AI.
const g = $('Input guard').first().json;
const cfg = $('Config').first().json;
const p = $input.first().json || {};
const ref = String($execution.id);
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);

const breakerFailures = num(cfg.breaker_failures, 3);
const sessionLimit = num(cfg.session_limit_per_min, 5);
const globalLimit = num(cfg.global_limit_per_min, 8);

const T = {
  breaker: [
    `The assistant is temporarily unavailable because the AI service is not responding. Our team is aware. Please try again in a few minutes. For anything urgent, write to people@brewtec.de and mention reference ${ref}.`,
    `Der Assistent ist gerade nicht verfügbar, weil der KI-Dienst nicht antwortet. Unser Team ist informiert. Bitte versuche es in ein paar Minuten noch einmal. Bei dringenden Fragen schreib an people@brewtec.de mit der Referenz ${ref}.`],
  session_limit: [
    'You are sending questions very quickly. Please wait a minute before your next question.',
    'Du sendest sehr schnell viele Fragen. Bitte warte eine Minute bis zur nächsten Frage.'],
  busy: [
    `Many colleagues are using the assistant right now. Please try again in about 1 minute. Reference: ${ref}`,
    `Gerade nutzen viele Kolleginnen und Kollegen den Assistenten. Bitte versuche es in etwa 1 Minute noch einmal. Referenz: ${ref}`],
};

let kind = '';
let reply = '';
if (p.cached_answer) { kind = 'cache'; reply = String(p.cached_answer); }
else if (num(p.ai_failures, 0) >= breakerFailures) kind = 'breaker';
else if (num(p.session_questions, 0) >= sessionLimit) kind = 'session_limit';
else if (num(p.all_questions, 0) >= globalLimit) kind = 'busy';
if (kind && kind !== 'cache') reply = T[kind][g.german ? 1 : 0];

return [{ json: {
  ...g,
  skip_ai: kind !== '',
  reply_kind: kind || '',
  reply,
  cached_sources: p.cached_sources || '',
  route: kind || 'ai',
} }];
