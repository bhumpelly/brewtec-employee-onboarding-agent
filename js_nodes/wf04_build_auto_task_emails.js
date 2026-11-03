// Node: Build auto task emails  (Workflow 4, JavaScript, Run Once for All Items)
// One email per due automatic task. Items without a configured link are skipped.
// The Employee Payroll Details Form gets a personal single-use link (pfb_token from the query) and is
// repeated as a reminder every 3 days until the new hire has submitted it.
const TEXTS = {
  pfb_form_url: ['Please fill in your Employee Payroll Details Form', 'please fill in the Employee Payroll Details Form before your first day. Payroll needs your bank, tax and social security details to pay you on time. The link below is personal, works once and for 14 days. You also need the personal code from your welcome e-mail. Enter these details only in this form, never by e-mail or chat.'],
  policies_url: ['Company policies to read before you start', 'here are the BrewTec company policies. Please read them before your first day. The company assistant can answer questions about them.'],
  training_url: ['Your IT security training', 'please complete the IT security training in your first week. It takes about 30 minutes.'],
  survey_url: ['How was your first month at BrewTec?', 'you have been with us for a month. Please tell us in a short survey how your onboarding went. It takes about 3 minutes and helps the next new colleague.'],
};
const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (!j.task_id) continue;
  const key = j.link_key || '';
  let link = String(j[key] ?? '').trim();
  if (!link) continue;
  if (j.task_key === 'pfb_form') {
    if (!j.pfb_token) continue;                       // already submitted, nothing to send
    link += (link.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(j.pfb_token);
  }
  let [subject, text] = TEXTS[key] || [j.title || 'BrewTec onboarding', 'here is your next onboarding step.'];
  const reminder = j.is_reminder === true || j.is_reminder === 'true';
  if (reminder) subject = 'Reminder: ' + subject;
  out.push({ json: {
    task_id: j.task_id,
    employee_id: j.employee_id ?? null,
    task_key: j.task_key ?? null,
    private_email: j.private_email ?? null,
    subject,
    body: `Hello ${j.first_name || ''},\n\n${reminder ? 'a friendly reminder: ' : ''}${text}\n\n${link}\n\nQuestions? Ask the BrewTec company assistant: ${j.chat_url || ''}\n\nBest regards\nPeople Ops, BrewTec GmbH`,
  } });
}
return out;
