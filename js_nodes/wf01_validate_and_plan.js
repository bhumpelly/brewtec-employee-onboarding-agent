// Node: Validate and plan  (Workflow 1, JavaScript, Run Once for All Items)
// Rules decide here, not the AI. Checks the form, proposes a work email,
// removes personal identifiers and builds the task plan.
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
// Names to e-mail: German rules first (ä -> ae), then letters Unicode does not split (ı, ł, đ),
// then every other accent is removed (ş -> s, ć -> c, ễ -> e). Bias test: Turkish, Polish, Serbian
// and Vietnamese names lost letters with the old fixed list. Names in other scripts (Cyrillic,
// Chinese) give no Latin letters, so a neutral address is proposed and HR sets the real one.
const SPECIAL = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ı': 'i', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ħ': 'h' };
const DEPARTMENTS = ['Engineering', 'Customer Success', 'Warehouse and Logistics', 'Marketing'];
const SITES = ['Koeln', 'Leverkusen'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// key, title, owner team, days relative to start date, auto email, link key
const TASKS = [
  ['welcome_email', 'Send welcome email with personal code and assistant link', 'hr', -14, true, 'chat_url'],
  ['pfb_form', 'Employee payroll details are submitted by the new hire (secure form)', 'new_hire', -13, true, 'pfb_form_url'],
  ['contract_check', 'Check that the signed contract is on file', 'hr', -12, false, ''],
  ['laptop_reserve', 'Reserve a device from stock', 'it', -10, false, ''],
  ['account_create', 'Create work account and add knowledge base group', 'it', -7, false, ''],
  ['laptop_setup', 'Set up and image the device', 'it', -5, false, ''],
  ['vpn_access', 'Grant VPN access after manager approval', 'it', -5, false, ''],
  ['mfa_tap', 'Prepare a Temporary Access Pass for day 1', 'it', -1, false, ''],
  ['badge', 'Prepare access badge', 'facilities', -5, false, ''],
  ['desk', 'Assign desk or locker', 'facilities', -5, false, ''],
  ['parking', 'Answer parking request if needed', 'facilities', -3, false, ''],
  ['buddy', 'Name an onboarding buddy', 'manager', -7, false, ''],
  ['first_week_plan', 'Share the first week plan', 'manager', -3, false, ''],
  ['team_announce', 'Announce the new colleague to the team', 'manager', -2, false, ''],
  ['policies_send', 'Send company policies to read', 'hr', -3, true, 'policies_url'],
  ['day1_welcome', 'Welcome on day 1 and hand over the device', 'manager', 0, false, ''],
  ['code_of_conduct', 'Sign code of conduct and data protection commitment', 'new_hire', 0, false, ''],
  ['safety_brief', 'Attend the workplace safety briefing', 'new_hire', 1, false, ''],
  ['personio_setup', 'Record working time in Personio', 'new_hire', 1, false, ''],
  ['it_security_training', 'Complete the IT security training', 'new_hire', 3, true, 'training_url'],
  ['check_in_week1', 'Week 1 check-in with manager', 'manager', 5, false, ''],
  ['check_in_30', '30-day check-in', 'manager', 30, false, ''],
  ['survey_30', 'Send 30-day onboarding survey', 'hr', 30, true, 'survey_url'],
  ['check_in_60', '60-day check-in', 'manager', 60, false, ''],
  ['probation_review', 'Prepare the probation review', 'hr', 85, false, ''],
];
const WAREHOUSE_TASK = ['warehouse_safety', 'Warehouse safety instruction and tablet handover', 'facilities', 0, false, ''];

const text = v => (v === null || v === undefined ? '' : String(v).trim());
const slug = v => {
  let s = v.toLowerCase();
  for (const [k, r] of Object.entries(SPECIAL)) s = s.split(k).join(r);
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
};
// Dates as YYYY-MM-DD strings, calculated in UTC so time zones cannot shift a day
function parseDate(value) {
  const v = text(value);
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = v.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  const reasons = [];
  const domain = text(j.company_domain).toLowerCase() || 'brewtec.de';
  const noticeDays = parseInt(text(j.notice_days) || '14', 10);
  const today = parseDate(j.today) ?? parseDate(new Date().toISOString());

  const first = text(j.first_name);
  const last = text(j.last_name);
  const privateEmail = text(j.private_email).toLowerCase();
  let workEmail = text(j.work_email).toLowerCase();
  const department = text(j.department);
  let jobTitle = text(j.job_title);
  const managerName = text(j.manager_name);
  const managerEmail = text(j.manager_email).toLowerCase();
  const site = text(j.site);
  let notes = text(j.notes);

  for (const [label, value] of [['First name', first], ['Last name', last], ['Private email', privateEmail],
    ['Department', department], ['Job title', jobTitle], ['Manager name', managerName],
    ['Manager email', managerEmail], ['Site', site]]) {
    if (!value) reasons.push(`${label} is missing.`);
  }
  if (privateEmail && !EMAIL_RE.test(privateEmail)) reasons.push('Private email is not a valid address.');
  if (privateEmail.endsWith('@' + domain)) reasons.push('Private email must be a personal address, not a company address.');
  if (managerEmail && !managerEmail.endsWith('@' + domain)) reasons.push(`Manager email must end with @${domain}.`);
  if (department && !DEPARTMENTS.includes(department)) reasons.push(`Department ${department} is not one of the four BrewTec departments.`);
  if (site && !SITES.includes(site)) reasons.push('Site must be Koeln or Leverkusen.');

  let emailWasProposed = false;
  if (workEmail) {
    if (!workEmail.endsWith('@' + domain) || !EMAIL_RE.test(workEmail)) {
      reasons.push(`Work email must end with @${domain}. Leave it empty to get a proposal.`);
    }
  } else if (first && last) {
    const a = slug(first), b = slug(last);
    workEmail = a && b ? `${a}.${b}@${domain}` : `new-hire-${slug(text(j.hris_id)) || Date.now().toString(36)}@${domain}`;
    emailWasProposed = true;
  }

  const start = parseDate(j.start_date);
  let daysAhead = null;
  if (start === null) {
    reasons.push('Start date is missing or not a date.');
  } else {
    daysAhead = Math.round((start - today) / DAY);
    if (daysAhead < noticeDays) {
      reasons.push(`Start date is ${daysAhead} days away. BrewTec needs at least ${noticeDays} days notice. Shorter notice is handled manually by People Ops.`);
    }
  }

  if ((parseInt(j.duplicates, 10) || 0) > 0) reasons.push('An open onboarding for this private email already exists.');

  let piiRemoved = false;
  if (hasPii(notes)) { notes = REMOVED; piiRemoved = true; }
  if (hasPii(jobTitle)) {
    jobTitle = REMOVED; piiRemoved = true;
    reasons.push('Job title contained personal data and was removed. Please submit again.');
  }

  const profile = { 'Engineering': 'developer', 'Warehouse and Logistics': 'warehouse' }[department] ?? 'standard';

  const tasks = [];
  if (start !== null) {
    const plan = department === 'Warehouse and Logistics' ? [...TASKS, WAREHOUSE_TASK] : TASKS;
    for (const [key, title, team, offset, auto, link] of plan) {
      tasks.push({ key, title, team, due: iso(Math.max(start + offset * DAY, today)), auto, link });
    }
  }

  const groups = ['all-employees', 'kb-readers', 'dept-' + slug(department || 'none')];
  out.push({ json: {
    valid: reasons.length === 0,
    reasons,
    reason_text: reasons.join(' '),
    first_name: first,
    last_name: last,
    display_name: `${first} ${last}`.trim(),
    private_email: privateEmail,
    work_email: workEmail,
    email_was_proposed: emailWasProposed,
    department,
    job_title: jobTitle,
    manager_name: managerName,
    manager_email: managerEmail,
    site,
    start_date: start !== null ? iso(start) : '',
    days_ahead: daysAhead,
    notes,
    pii_removed: piiRemoved,
    profile,
    groups,
    groups_pg: '{' + groups.join(',') + '}',
    task_count: tasks.length,
    tasks_json: JSON.stringify(tasks),
  } });
}
return out;
