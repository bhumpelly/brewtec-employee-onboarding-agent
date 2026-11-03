// Node: Build alert  (Workflow 6, JavaScript, Run Once for All Items)
// Turns n8n's error event into a short, readable alert. Works for node errors and trigger errors.
const j = $input.first().json || {};
const exec = j.execution || {};
const wf = j.workflow || {};
const trig = j.trigger || {};
const err = exec.error || trig.error || {};
const node = exec.lastNodeExecuted || (err.node && err.node.name) || 'unknown node';
const message = String(err.message || err.description || 'unknown error').replace(/\s+/g, ' ').slice(0, 600);
const where = exec.url || (exec.id ? `execution ${exec.id}` : 'see the Executions tab');

// A hire stopped by an onboarding rule (workflow 1, "Stop with reason") is expected, not a failure.
const ruleStop = node === 'Stop with reason';
const text = ruleStop
  ? `**Hire stopped by an onboarding rule: ${wf.name || 'unknown workflow'}**\n` +
    `Reason: ${message.replace(/^New hire not started:\s*/, '')}\nWhere: ${where}\n` +
    'Expected behaviour, nothing is broken. People Ops sees the reason in the HR portal and handles the hire manually.'
  : `**Workflow failed: ${wf.name || 'unknown workflow'}**\n` +
    `Node: ${node}\nError: ${message}\nWhere: ${where}\n` +
    'Nothing after this node ran. Open the execution in n8n, fix the cause and run it again.';

return [{ json: {
  workflow_name: wf.name || 'unknown workflow',
  node,
  message,
  discord_message: text.length > 1900 ? text.slice(0, 1897) + '...' : text,
} }];
