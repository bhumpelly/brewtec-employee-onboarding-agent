// Node: Validate hire  (Workflow 10, HR portal, JavaScript, Run Once for All Items)
// Server-side check of the "Hire Employee" form before anything is written to Workday.
// The browser form also checks fields, but only this check counts.
//  1. Page token check: the request must come from the HR portal page itself (see below).
//  2. Required fields, lengths, e-mail format, a real date, and values from the fixed lists.
// HR system rules only. Onboarding rules (14 days notice, @brewtec.de manager, the four
// onboarding departments) stay in workflow 1, so a hire can be valid in Workday and still be
// rejected by onboarding, as in a real company.
const ORGS = ['Engineering', 'Customer Success', 'Warehouse and Logistics', 'Marketing', 'Finance', 'Sales'];
const SITES = ['Koeln', 'Leverkusen'];
const STATUS = { 'Successfully Completed': 'hired', 'In Progress': 'offer_signed' };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PII = /(steuer-?id|tax[ -]?id|iban|sozialversicherungsnummer|social security|\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b|(?<!\d)\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}(?!\d))/i;

// Page token: every HR portal page carries a token signed by the database (valid 2 hours).
// "Check page token" verified it before this node. A page on another website cannot get one,
// so it cannot make a logged-in browser submit forms here (cross-site request forgery).
// n8n shows webhook pages in a browser sandbox, so browser origin headers cannot be used for this.
const safe = name => { try { return $(name).first().json; } catch (e) { return null; } };
function tokenProblem(pt, portal) {
  if (pt && pt.ok === true) return '';
  if (pt && pt.reason === 'expired') return `This page has expired. Reload the ${portal} and try again.`;
  return `The request did not come from the ${portal}. Reload the ${portal} and try again.`;
}

const j = safe('Submit hire') || $input.first().json || {};
const pt = ($input.first().json || {}).pt;
const b = j.body || {};
const t = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const hire = {
  first_name: t(b.first_name, 60),
  last_name: t(b.last_name, 60),
  private_email: t(b.private_email, 120).toLowerCase(),
  department: t(b.department, 60),
  job_title: t(b.job_title, 80),
  manager_name: t(b.manager_name, 80),
  manager_email: t(b.manager_email, 120).toLowerCase(),
  site: t(b.site, 30),
  start_date: t(b.start_date, 10),
  status_label: t(b.status, 40),
  notes: t(b.notes, 500),
};

const errors = [];
const tokenError = tokenProblem(pt, 'HR portal');
if (tokenError) errors.push(tokenError);
for (const [k, label] of [['first_name', 'First name'], ['last_name', 'Last name'], ['private_email', 'Personal e-mail'],
  ['job_title', 'Business title'], ['manager_name', 'Manager'], ['manager_email', 'Manager e-mail']]) {
  if (!hire[k]) errors.push(`${label} is missing.`);
}
if (hire.private_email && !EMAIL_RE.test(hire.private_email)) errors.push('Personal e-mail is not a valid address.');
if (hire.manager_email && !EMAIL_RE.test(hire.manager_email)) errors.push('Manager e-mail is not a valid address.');
if (!ORGS.includes(hire.department)) errors.push('Choose a supervisory organization from the list.');
if (!SITES.includes(hire.site)) errors.push('Choose a location from the list.');
if (!(hire.status_label in STATUS)) errors.push('Choose a hire status from the list.');
const d = /^\d{4}-\d{2}-\d{2}$/.test(hire.start_date) ? new Date(hire.start_date + 'T00:00:00Z') : null;
if (!d || isNaN(d) || d.toISOString().slice(0, 10) !== hire.start_date) errors.push('Hire date is not a valid date.');
if (PII.test(hire.notes)) errors.push('The comment looks like it contains a tax, bank or social security number. Remove it: these details belong in the employee payroll details only.');

const valid = errors.length === 0;
return [{ json: {
  ...hire,
  status: STATUS[hire.status_label] || '',
  valid,
  message: valid ? '' : errors.join(' '),
} }];
