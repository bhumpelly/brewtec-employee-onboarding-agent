// Node: Validate status change  (Workflow 10, HR portal, JavaScript, Run Once for All Items)
// HR completes or withdraws a hire from the portal list. Page token check as for new hires,
// a numeric worker id, and only the two allowed actions.
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
const ACTIONS = { complete: 'hired', withdraw: 'withdrawn' };
const j = safe('Change status') || $input.first().json || {};
const pt = ($input.first().json || {}).pt;
const b = j.body || {};
const workerId = String(b.worker_id ?? '').trim();
const action = String(b.action ?? '').trim();

let message = tokenProblem(pt, 'HR portal');
if (!message && !/^[A-Za-z0-9-]{1,20}$/.test(workerId)) message = 'Unknown worker.';
if (!message && !(action in ACTIONS)) message = 'Unknown action.';

return [{ json: {
  worker_id: workerId,
  action,
  new_status: ACTIONS[action] || '',
  valid: message === '',
  message,
} }];
