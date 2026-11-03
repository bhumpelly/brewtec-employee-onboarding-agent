// Node: Check request  (Workflow 12, payroll portal, JavaScript, Run Once for All Items)
// For "Open" and "Mark exported": page token check, a real employee id, and the name of the
// logged-in payroll user for the access log (taken from the login, never the password).
// The token is bound to the login that opened the page, so it only works for that payroll user.
// Page token: every payroll portal page carries a token signed by the database (valid 2 hours).
// "Check page token" verified it before this node. A page on another website cannot get one,
// so it cannot make a logged-in browser submit forms here (cross-site request forgery).
// n8n shows webhook pages in a browser sandbox, so browser origin headers cannot be used for this.
const safe = name => { try { return $(name).first().json; } catch (e) { return null; } };
function tokenProblem(pt, portal) {
  if (pt && pt.ok === true) return '';
  if (pt && pt.reason === 'expired') return `This page has expired. Reload the ${portal} and try again.`;
  return `The request did not come from the ${portal}. Reload the ${portal} and try again.`;
}
function loginName(h) {
  const m = /^Basic\s+(.+)$/i.exec(String(h.authorization || ''));
  if (!m) return 'unknown';
  try {
    const decoded = typeof Buffer !== 'undefined' ? Buffer.from(m[1], 'base64').toString('utf8') : atob(m[1]);
    return (decoded.split(':')[0].replace(/[^A-Za-z0-9._@-]/g, '') || 'unknown').slice(0, 60);
  } catch (e) { return 'unknown'; }
}
const j = safe('Open record') || safe('Mark transferred') || $input.first().json || {};
const pt = ($input.first().json || {}).pt;
const h = j.headers || {};
const id = String((j.body || {}).employee_id ?? '').trim();
let message = tokenProblem(pt, 'payroll portal');
if (!message && pt.actor !== loginName(h)) message = 'This page was opened with a different login. Reload the payroll portal and try again.';
if (!message && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) message = 'Unknown employee.';
return [{ json: { valid: message === '', message, employee_id: id, actor: 'payroll:' + loginName(h) } }];
