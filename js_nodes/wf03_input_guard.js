// Node: Input guard  (Workflow 3, JavaScript, Run Once for All Items)
// Runs before the AI. Personal identifiers never reach the model and are never stored.
// Small talk, empty or overlong messages, attempts to change the rules, requests for another
// person's personal data and clearly unrelated requests get a fixed reply without any AI call, so they never become a hand-off.
// It also prepares two privacy-safe fields:
//   log_input  what is stored in chat_messages and posted to Discord: e-mail addresses, phone
//              numbers and access codes are masked, and personal health statements are replaced
//              by a topic label (GDPR Art. 9 special category data is not stored)
//   cache_key  normalised question for the answer cache, empty when the question must not be
//              cached (personal, follow-up, too short, quality check)
const PII_PATTERNS = [
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/i,
  /(?<!\d)\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}(?!\d)/i,
  /\b\d{2}[ ]?\d{6}[ ]?[A-Z][ ]?\d{3}\b/i,
];
const PII_KEYWORDS = /(steuer-?id|steueridentifikationsnummer|tax[ -]?id|iban|sozialversicherungsnummer|sv-?nummer|rentenversicherungsnummer|social security|passport|reisepass|personalausweis|krankenversicherungsnummer|bank account|kontonummer)/i;
const REMOVED = '[removed: personal data]';

function hasPii(value) {
  if (!value) return false;
  if (PII_PATTERNS.some(p => p.test(value))) return true;
  if (PII_KEYWORDS.test(value)) {
    const compact = value.replace(/[ .\-\/]/g, '');
    // keyword plus a long number or an ID-like token (6+ characters with 3+ digits)
    if (/\d{6,}/.test(compact) || /\b(?=[A-Z0-9]*\d[A-Z0-9]*\d[A-Z0-9]*\d)[A-Z0-9]{6,}\b/i.test(value)) return true;
  }
  return false;
}

const GERMAN = /^(hallo|moin|servus|guten|danke|vielen|tschuess|tschüss|auf wiedersehen|wie |wer |was |wo |wann |warum |kann |darf |muss |ich |schreib|erz(ä|ae)hl|gibt |welche |sag )|\b(ich|mein|meine|nicht|bitte|wie|und|der|das|ist|für|über|kann|darf|muss|gibt|wann)\b/i;
const de = m => GERMAN.test(m);

const BLOCK_REPLY = 'For your safety I removed that message because it looked like it contained personal ' +
  'data such as a tax ID, IBAN or social security number. Please never send these details ' +
  'by chat or email. Enter them only in the secure Employee Payroll Details Form, or ask Payroll at ' +
  'payroll@brewtec.de. You can ask me your question again without the numbers.';

// Greetings, thanks and goodbyes get a fixed reply. No AI call, no hand-off to People Ops.
const SMALLTALK = [
  [/^(hi|hello|hey|hallo|moin|servus|good (morning|afternoon|evening)|guten (morgen|tag|abend))\b/i,
   'Hi! I answer questions about BrewTec policies, for example leave, sickness, working time, VPN, expenses, payroll, parking or your first day. What would you like to know?',
   'Hallo! Ich beantworte Fragen zu den BrewTec-Richtlinien, zum Beispiel Urlaub, Krankheit, Arbeitszeit, VPN, Spesen, Gehalt, Parken oder deinen ersten Tag. Was möchtest du wissen?'],
  [/^(thanks|thank you|thx|danke|vielen dank|merci)\b/i,
   'You are welcome. Ask me anytime if you have another question about BrewTec.',
   'Gern geschehen. Frag mich jederzeit, wenn du noch eine Frage zu BrewTec hast.'],
  [/^(how are you( doing)?|how is it going|how's it going|wie geht'?s( dir| ihnen)?|wie geht es (dir|ihnen))/i,
   'I am fine, thanks for asking. I am here for your questions about BrewTec policies, for example leave, working time, VPN or payroll.',
   'Mir geht es gut, danke der Nachfrage. Ich bin für deine Fragen zu den BrewTec-Richtlinien da, zum Beispiel Urlaub, Arbeitszeit, VPN oder Gehalt.'],
  [/^(who are you|what can you do|what do you do|wer bist du|was kannst du|was machst du)/i,
   'I am the BrewTec company assistant, an AI system. I answer questions from the official BrewTec documents and name the source, and I pass anything else to People Ops. New colleagues can check their onboarding tasks with their personal code.',
   'Ich bin der BrewTec-Firmenassistent, ein KI-System. Ich beantworte Fragen aus den offiziellen BrewTec-Dokumenten und nenne die Quelle. Alles andere gebe ich an People Ops weiter. Neue Kolleginnen und Kollegen sehen mit ihrem persönlichen Code ihre Onboarding-Aufgaben.'],
  [/^(bye|goodbye|see you|tschuess|tschüss|ciao|auf wiedersehen)\b/i,
   'Goodbye, and have a good day at BrewTec.',
   'Tschüss und einen schönen Tag bei BrewTec.'],
];
const FILLER = /^[\s!.,?:)\-]*(there|team|brewtec|all|everyone|zusammen|again|so much|a lot|very much|sehr|today|heute)?[\s!.,?:)\-]*$/i;

function smalltalk(msg) {
  const m = msg.trim();
  if (m.length > 40) return '';
  for (const [re, en, ger] of SMALLTALK) {
    const hit = m.match(re);
    if (hit && FILLER.test(m.slice(hit[0].length))) return de(m) ? ger : en;
  }
  return '';
}

// Clearly unrelated requests. Only unambiguous patterns live here: everything else is judged by
// the AI, which answers OFFTOPIC for non-work questions (the answer check turns that into the
// same fixed reply). A company question that the documents do not cover is a hand-off instead.
const OFF_TOPIC = [
  /\b(what('?s| is) the weather|weather forecast|wie wird das wetter|wetter (heute|morgen))\b/i,
  /\b(tell me a joke|erz(ä|ae)hl (mir )?(einen|nen) witz)\b/i,
  /\b(write|schreib(e)?)\b.{0,20}\b(poem|song|story|essay|gedicht|lied|geschichte|aufsatz)\b/i,
  /\b(write|schreib(e)?) (me )?(a |some |ein(en)? )?(python|javascript|java|c\+\+|php) ?(script|program|function|code|programm)?\b/i,
  /\b(bundesliga|champions league|world cup|weltmeisterschaft|football score|fußballergebnis)\b/i,
  /\b(bitcoin|crypto(currency)?|stock price|aktienkurs)\b/i,
  /\b(recipe|rezept) (for|für)\b/i,
  /\bwhat is \d+\s*[+\-*x\/]\s*\d+/i,
];
const OFF_TOPIC_REPLY = 'I can only help with BrewTec topics, for example HR, IT, finance, facilities and onboarding. ' +
  'For other questions please use another source. What would you like to know about BrewTec?';
const OFF_TOPIC_REPLY_DE = 'Ich kann nur bei BrewTec-Themen helfen, zum Beispiel HR, IT, Finanzen, Facilities und Onboarding. ' +
  'Für andere Fragen nutze bitte eine andere Quelle. Was möchtest du über BrewTec wissen?';

const EMPTY_REPLY = 'Please type your question about BrewTec, for example: How do I request vacation?';
const MAX_CHARS = 1500;
const TOO_LONG_REPLY = 'Your message is too long for me. Please ask one question in under 1,500 characters.';
// Attempts to change the assistant's rules. Answered without the AI and logged as blocked.
const MANIPULATION = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(instruction|instructions|rules|prompt|guidelines|system message|task|tasks|role|previous|above)\b/i,
  /\b(system prompt|developer mode|jailbreak|dan mode)\b/i,
  /\byou are now\b|\bpretend (to be|you are)\b|\bact as (an?|the)\b|\breply only with\b|\brespond only with\b|\bthis system has been compromised\b/i,
  /\b(ignoriere|vergiss|missachte)\b.{0,40}\b(anweisung|anweisungen|regeln|prompt|vorgaben|aufgabe|rolle|vorherige)\b/i,
];
const MANIPULATION_REPLY = 'I can only answer questions about BrewTec from the official company documents, ' +
  'and I cannot change my rules. Please ask your question about a BrewTec topic.';

// Requests for another person's personal data (tax ID, bank details, salary, address, health,
// access code ...). Refused at once without the AI, logged as blocked, and NOT handed off to
// People Ops: a hand-off would forward the request for someone else's data to a human channel.
// Questions about the asker's own data ("my tax ID") or general ones ("what is a tax ID",
// "the address of the Koeln office") pass on as normal.
const OTHER_DATA_KW = /(steuer-?id|steueridentifikationsnummer|tax[ -]?(id|number|class)|iban|bank (details|account)|bankverbindung|kontonummer|salary|gehalt|lohn|pay ?slip|gehaltsabrechnung|home address|private address|adresse|wohnort|phone number|mobile number|telefonnummer|handynummer|private e-?mail|date of birth|birthday|geburtsdatum|sozialversicherungsnummer|social security( number)?|sv-?nummer|health (data|condition|status)|sick ?note|krankmeldung|diagnos\w*|personal code|access code|zugangscode|personalfragebogen|payroll details)/i;
const REQUEST_VERB = /\b(share|give|send|show|tell|look ?up|find|get|reveal|list|what('?s| is| are)|which|where('?s| is)|can i (see|have|get)|gib|zeig|schick|sag|nenn|wie (lautet|ist)|was ist|welche)\b/i;
const OWN_OR_GENERAL = /^(my|mine|our|your|a|an|the|this|that|any|ein|eine|einen|einer|der|die|das|den|dem|mein|meine|meinen|meiner|meines|unser|unsere|dein|deine|ihr|ihre|of|for|about|to|und|and|or|oder|new|neue|neuen|own|eigene|eigenen|is|ist|are|sind|do|does|how|wie|when|wann|where|wo|what|was|which|welche|welchen|welcher|i|ich|me|mir|us|uns|share|give|send|show|tell|get|see|find|check|change|update|enter|submit|correct|need|know|have|request|receive|gib|zeig|schick|sag|nenn|ändern|aendern|eintragen|finde|bekomme|lautet|in|im|on|at|with|mit|bei|per|by|from|zur|zum|neue|current|aktuelle|aktuellen|official|first|next|last|monthly|annual|yearly|gross|net|erstes|erste|ersten|erster|nächstes|nächste|nächsten|letztes|letzte|letzten|monatliche|monatlichen|monatliches)$/i;
function otherPersonData(text) {
  const m = OTHER_DATA_KW.exec(text);
  if (!m || !REQUEST_VERB.test(text)) return false;
  const before = text.slice(0, m.index).replace(/[^\p{L}\p{N}' ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const prev = (before.pop() || '').replace(/'s$|s'$/i, '');
  const prevRaw = before.length ? text.slice(0, m.index).trim().split(/\s+/).pop() : prev;
  if (prev && !OWN_OR_GENERAL.test(prev)) return true;               // "clara tax id", "Max's IBAN"
  if (/'s$/i.test(prevRaw || '')) return true;
  const after = text.slice(m.index + m[0].length);
  // "the tax ID of Clara", "die Steuer-ID von Max"
  return /^\s*(of|von|for|für)\s+(?!(the|a|an|my|me|mein\w*|mir|new|neue\w*|employees|mitarbeitende|a new|einen|eine|der|die|das)\b)[\p{L}]/iu.test(after);
}
const OTHER_DATA_REPLY = 'I cannot share personal data about other people, for example tax IDs, bank details, salary, ' +
  'addresses, contact details or health information. Only Payroll and HR can see these details, and only for their work. ' +
  'If you need something for a work process, please contact payroll@brewtec.de or people@brewtec.de.';
const OTHER_DATA_REPLY_DE = 'Ich kann keine persönlichen Daten über andere Personen weitergeben, zum Beispiel Steuer-ID, ' +
  'Bankverbindung, Gehalt, Adresse, Kontaktdaten oder Gesundheitsdaten. Nur Payroll und HR sehen diese Daten, und nur für ihre Arbeit. ' +
  'Wenn du etwas für einen Arbeitsablauf brauchst, schreib bitte an payroll@brewtec.de oder people@brewtec.de.';

// ---- privacy-safe log text ----
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w])\+?\d[\d \/-]{7,}\d(?![\w])/g;
const CODE_AFTER_WORD = /\b(code|kode|zugangscode)\b(\s*(is|ist|:|=))?\s*[A-Z0-9]{6}\b/gi;
const CODE_TOKEN = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/gi;
const HEALTH = /\b(sick|ill|illness|disease|diagnos\w*|therap\w*|depress\w*|anxiety|burn-?out|pregnan\w*|cancer|surgery|medication|disabilit\w*|krank\w*|schwanger\w*|diagnose|therapie|behinderung|arzt|ärztin|op-termin|kur)\b/i;
const FIRST_PERSON = /\b(i|i'm|my|me|ich|mein\w*|mir|mich)\b/i;
const SENSITIVE_LABEL = '[personal health-related question, text not stored]';

function maskForLog(text) {
  return text
    .replace(EMAIL, '[email]')
    .replace(PHONE, m => (m.replace(/\D/g, '').length >= 9 ? '[phone]' : m))
    .replace(CODE_AFTER_WORD, (m, w) => `${w} [code]`)
    .replace(CODE_TOKEN, '[code]');
}

// ---- cache key ----
const FOLLOW_UP = /^(and|also|what about|how about|und|auch|was ist mit|wie ist es mit|und wenn|but|aber)\b/i;
function cacheKey(text, session, sensitive) {
  if (session.startsWith('qc-') || sensitive) return '';
  if (CODE_TOKEN.test(text)) { CODE_TOKEN.lastIndex = 0; return ''; }
  CODE_TOKEN.lastIndex = 0;
  if (FOLLOW_UP.test(text.trim())) return '';
  const norm = text.toLowerCase().normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (norm.split(' ').length < 4 || norm.length > 300) return '';
  return norm;
}

return $input.all().map(item => {
  const j = item.json;
  const raw = String(j.chatInput ?? '').trim();
  const sessionId = String(j.sessionId || 'no-session');
  let kind = '';
  let reply = '';
  if (!raw) { kind = 'empty'; reply = EMPTY_REPLY; }
  else if (raw.length > MAX_CHARS) { kind = 'too_long'; reply = TOO_LONG_REPLY; }
  else if (hasPii(raw)) { kind = 'pii'; reply = BLOCK_REPLY; }
  else if (MANIPULATION.some(p => p.test(raw))) { kind = 'manipulation'; reply = MANIPULATION_REPLY; }
  else if (otherPersonData(raw)) { kind = 'other_person_data'; reply = de(raw) ? OTHER_DATA_REPLY_DE : OTHER_DATA_REPLY; }
  else if (OFF_TOPIC.some(p => p.test(raw))) { kind = 'off_topic'; reply = de(raw) ? OFF_TOPIC_REPLY_DE : OFF_TOPIC_REPLY; }
  else { const small = smalltalk(raw); if (small) { kind = 'small talk'; reply = small; } }

  const pii = kind === 'pii';
  const safe = pii ? REMOVED : raw.slice(0, MAX_CHARS);
  const sensitive = !pii && HEALTH.test(safe) && FIRST_PERSON.test(safe);
  const logInput = pii ? REMOVED : (sensitive ? SENSITIVE_LABEL : maskForLog(safe));
  return { json: {
    sessionId,
    // Goes to the AI. Personal ID numbers never get here.
    safe_input: safe,
    // Goes to the database and to Discord.
    log_input: logInput,
    sensitive,
    cache_key: kind ? '' : cacheKey(safe, sessionId, sensitive),
    german: de(raw),
    blocked: pii || kind === 'manipulation' || kind === 'other_person_data',
    smalltalk: kind === 'small talk',
    reply_kind: kind,
    skip_ai: kind !== '',
    reply,
    discord_hr_webhook: j.discord_hr_webhook ?? '',
  } };
});
