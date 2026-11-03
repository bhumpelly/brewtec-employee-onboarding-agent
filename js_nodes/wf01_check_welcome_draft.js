// Node: Check welcome draft  (Workflow 1, JavaScript, Run Once for All Items)
// The AI only writes text. This code checks the draft and falls back to a template.
// The personal code and the assistant link are added here by code, never by the AI.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONEY = /(\d[\d.,]*\s*(€|eur\b|euro))|((€|eur\b|euro)\s*\d)/;
const FORBIDDEN = ['salary', 'gehalt', 'bonus', 'probation', 'probezeit', 'kündigung', 'notice period',
  'contract', 'vertrag', 'stock option', 'equity', 'raise', 'pay rise', 'overtime pay'];

return $input.all().map(item => {
  const j = item.json;
  const hire = j.hire ?? {};
  const emp = j.employee ?? {};
  let draft = String(j.draft ?? '').trim();
  const chatUrl = String(j.chat_url ?? '').trim();
  const first = hire.first_name ?? '';

  const issues = [];
  const low = draft.toLowerCase();
  if (!draft) issues.push('empty draft');
  if (MONEY.test(low)) issues.push('mentions money');
  for (const word of FORBIDDEN) if (low.includes(word)) issues.push(`mentions '${word}'`);
  if (/\[[^\]]*\]|\{[^}]*\}|<[^>]*>/.test(draft)) issues.push('contains placeholders or markup');
  if (first && !low.includes(first.toLowerCase())) issues.push('does not greet the new hire by name');
  const words = draft.split(/\s+/).filter(Boolean).length;
  if (words < 40 || words > 220) issues.push(`length ${words} words, expected 40 to 220`);

  const draftOk = issues.length === 0;
  if (!draftOk) {
    draft = `Dear ${first},\n\nwelcome to BrewTec. We are glad that you join the ${hire.department ?? ''} team ` +
      `as ${hire.job_title ?? ''} on ${hire.start_date ?? ''} at our ${hire.site ?? ''} site. Your manager ` +
      `${hire.manager_name ?? ''} and the People Ops team are preparing your first days, so your device, ` +
      `account and badge are ready when you arrive. Before you start you will receive a few short emails, ` +
      `for example the employee payroll details and our company policies.`;
  }

  const code = emp.access_code ?? '';
  const welcomeText = `${draft}\n\nYour BrewTec e-mail address will be: ${hire.work_email ?? ''}\n` +
    `You get your password together with your laptop on your first day. We never send passwords by e-mail. ` +
    `Until then, our IT team contacts you with a separate login for the employee area.\n\n` +
    `Your personal code: ${code}\nBrewTec company assistant: ${chatUrl}\n` +
    `Ask the assistant anything about BrewTec policies. Give it your code to see your own onboarding tasks. ` +
    `Please never send tax, bank or social security details by email or chat.\n\nBest regards\nPeople Ops, BrewTec GmbH`;

  const rows = [
    ['Name', hire.display_name ?? ''],
    ['Department', hire.department ?? ''],
    ['Job title', hire.job_title ?? ''],
    ['Site', hire.site ?? ''],
    ['Start date', `${hire.start_date ?? ''} (${hire.days_ahead ?? ''} days ahead)`],
    ['Manager', hire.manager_name ?? ''],
    ['Work email', `${hire.work_email ?? ''} (${hire.email_was_proposed ? 'proposed from the name' : 'given on the form'})`],
    ['Device profile', hire.profile ?? ''],
    ['Task plan', `${hire.task_count ?? 0} tasks planned`],
    ['Personal data check', hire.pii_removed ? 'Personal data was found in the notes and removed' : 'No personal identifiers found'],
    ['AI draft check', draftOk ? 'Passed' : `Failed (${issues.join(', ')}), template used`],
  ];
  const table = rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
  const approvalHtml = `<p>A new hire is waiting for your approval. Nothing has been sent yet.</p>` +
    `<table cellpadding='4'>${table}</table>` +
    `<p><b>Welcome email that will be sent after approval:</b></p>` +
    `<p>${esc(welcomeText).replace(/\n/g, '<br>')}</p>` +
    `<p>Approve starts the onboarding: welcome email, device reservation, account plan, ` +
    `Discord hand-offs and tickets. Send back stops the run.</p>`;

  return { json: {
    employee_id: emp.employee_id ?? '',
    access_code: code,
    first_name: first,
    last_name: hire.last_name ?? '',
    display_name: hire.display_name ?? '',
    private_email: hire.private_email ?? '',
    work_email: hire.work_email ?? '',
    department: hire.department ?? '',
    job_title: hire.job_title ?? '',
    site: hire.site ?? '',
    start_date: hire.start_date ?? '',
    manager_name: hire.manager_name ?? '',
    profile: hire.profile ?? 'standard',
    groups_pg: hire.groups_pg ?? '{all-employees,kb-readers}',
    tasks_json: hire.tasks_json ?? '[]',
    draft_ok: draftOk,
    draft_issues: issues.join(', '),
    welcome_subject: `Welcome to BrewTec, ${first}`,
    welcome_text: welcomeText,
    approval_subject: `Approval needed: new hire ${hire.display_name ?? ''}, start ${hire.start_date ?? ''}`,
    approval_html: approvalHtml,
  } };
});
