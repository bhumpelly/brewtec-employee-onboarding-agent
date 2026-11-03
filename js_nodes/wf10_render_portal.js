// Node: Render portal  (Workflow 10, HR portal, JavaScript, Run Once for All Items)
// Builds the HR portal page: key numbers, every Workday hire with its onboarding progress,
// actions for hires that are not final yet, and the "Hire Employee" form.
// Every value from the database or the address bar is HTML-escaped before it is placed in the page.
// The page shows only what HR needs: no private e-mail addresses and no personal access codes.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = ($('HR portal page').first().json || {}).query || {};
// Signed page token from "Issue page token". Every form on this page sends it back (hidden field pt).
let pageToken = '';
try { pageToken = String($('Issue page token').first().json.page_token || ''); } catch (e) { pageToken = ''; }
const ptField = `<input type="hidden" name="pt" value="${esc(pageToken)}">`;
const rows = $input.all().map(i => i.json).filter(r => r && r.worker_id);
const today = new Date().toISOString().slice(0, 10);
const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

const n = (f) => rows.filter(f).length;
const stats = [
  ['Waiting for HR approval', n(r => r.onboarding_status === 'pending_approval'), 'Approve in the e-mail from the onboarding agent'],
  ['In onboarding', n(r => r.onboarding_status === 'approved'), `${n(r => r.onboarding_status === 'approved' && r.start_date >= today && r.start_date <= in14)} start in the next 14 days`],
  ['Need attention', n(r => r.sync_status === 'rejected'), 'Rejected by onboarding, see the reason'],
  ['Not final yet', n(r => r.hris_status === 'offer_signed'), 'Hire business process In Progress'],
];

function workdayPill(s) {
  if (s === 'hired') return '<span class="pill ok">Successfully Completed</span>';
  if (s === 'offer_signed') return '<span class="pill warn">In Progress</span>';
  return '<span class="pill mute">Rescinded</span>';
}
function onboardingCell(r) {
  if (r.sync_status === 'rejected') return `<span class="pill bad">Rejected</span><div class="note">${esc(r.sync_note)}</div>`;
  if (r.onboarding_status === 'approved') {
    const total = Number(r.tasks_total || 0), done = Number(r.tasks_done || 0), over = Number(r.tasks_overdue || 0);
    const pct = total ? Math.round(100 * done / total) : 0;
    const pfb = r.pfb_iban_masked ? `Employee Payroll Details received (IBAN <span class="mono">${esc(r.pfb_iban_masked)}</span>)`
      : (r.pfb_last_sent ? `Employee Payroll Details: link sent ${esc(r.pfb_last_sent)}, not submitted yet` : 'Employee Payroll Details: link not sent yet');
    return `<span class="pill ok">In onboarding</span><div class="bar" title="${done} of ${total} tasks done"><i style="width:${pct}%"></i></div>` +
      `<div class="note">${done} of ${total} tasks${over ? `, <b class="over">${over} overdue</b>` : ''}</div><div class="note">${pfb}</div>`;
  }
  if (r.onboarding_status === 'pending_approval') return '<span class="pill warn">Waiting for HR approval</span>';
  if (r.onboarding_status === 'sent_back') return '<span class="pill mute">Sent back by HR</span>';
  if (r.sync_status === 'sent_to_onboarding') return '<span class="pill mute">Sent, processing</span>';
  if (r.hris_status === 'hired') return '<span class="pill mute">Picked up within 5 min</span>';
  return '<span class="note">Starts when the hire is completed</span>';
}
function actions(r) {
  const btn = (action, label, cls) => `<form method="post" action="/webhook/brewtec/hr/status" class="inline">` +
    ptField + `<input type="hidden" name="worker_id" value="${esc(r.worker_id)}"><input type="hidden" name="action" value="${action}">` +
    `<button class="${cls}" type="submit">${label}</button></form>`;
  if (r.hris_status === 'offer_signed') return btn('complete', 'Complete hire', 'small') + btn('withdraw', 'Withdraw', 'small line');
  if (r.hris_status === 'hired' && !r.onboarding_status && r.sync_status !== 'rejected') return btn('withdraw', 'Withdraw', 'small line');
  return '';
}

const tableRows = rows.map(r => `<tr>
  <td class="mono">${esc(r.worker_id)}</td>
  <td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong><div class="note">${esc(r.job_title)}</div></td>
  <td>${esc(r.department)}<div class="note">Manager: ${esc(r.manager_name)}</div></td>
  <td>${esc(r.site)}</td>
  <td class="mono">${esc(r.start_date)}</td>
  <td>${workdayPill(r.hris_status)}</td>
  <td>${onboardingCell(r)}</td>
  <td class="note">${r.device ? `<span class="mono">${esc(r.device)}</span><br>` : ''}${esc(r.account || '')}</td>
  <td class="acts">${actions(r)}</td>
</tr>`).join('');

const banner = q.msg ? `<div class="banner ${q.ok === '1' ? 'ok' : 'bad'}" role="status">${esc(q.msg)}</div>` : '';
const opt = (list) => list.map(v => `<option>${esc(v)}</option>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>BrewTec HR portal</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{--paper:#eef0ee;--panel:#f8f9f8;--steel:#d5d9d6;--ink:#1c1f1e;--ink-soft:#59605d;--brass:#a8761c;--brass-ink:#fffaf0;--graphite:#232726;--on-graphite:#e9ece9;
--ok:#2e7a4e;--ok-bg:#e3f1e8;--warn:#8a5d10;--warn-bg:#fbf1dc;--bad:#b5402f;--bad-bg:#f9e6e3;--mute-bg:#e3e6e4;
--display:"Archivo","Arial Narrow",Arial,sans-serif;--body:"Source Sans 3","Segoe UI",system-ui,sans-serif;--mono:"JetBrains Mono",Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#141716;--panel:#1b1f1e;--steel:#2c3230;--ink:#e6e9e7;--ink-soft:#9ba39f;--brass:#d6a24a;--brass-ink:#1a1408;--graphite:#0d0f0e;
--ok:#6cc28f;--ok-bg:#16291e;--warn:#e0b25c;--warn-bg:#2f2716;--bad:#e07a6a;--bad-bg:#331d1a;--mute-bg:#262b29;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--paper);color:var(--ink);font:16px/1.55 var(--body)}
a{color:inherit}button,input,select,textarea{font:inherit;color:inherit}:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.wrap{max-width:1240px;margin:0 auto;padding-inline:max(16px,env(safe-area-inset-left,0px))}
h1,h2{font-family:var(--display);font-stretch:78%;line-height:1.05;margin:0}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--brass)}
header{background:var(--graphite);color:var(--on-graphite)}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:14px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;font:800 22px/1 var(--display);font-stretch:75%;letter-spacing:.02em;text-decoration:none}
.logo small{font:500 12px/1 var(--mono);letter-spacing:.1em;color:#a9b0ad;text-transform:uppercase;margin-left:6px}
header nav{display:flex;gap:18px;font-size:14px}header nav a{color:#c3c9c6;text-decoration:none}header nav a:hover{color:#fff}
main{padding-block:28px 60px}
.title{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.title h1{font-size:clamp(32px,4.4vw,48px);font-weight:800;margin-top:8px}.title p{margin:0 0 10px;color:var(--ink-soft);max-width:36em}
.banner{padding:12px 16px;border-radius:6px;margin-bottom:18px;border:1px solid}
.banner.ok{background:var(--ok-bg);border-color:var(--ok);color:var(--ok)}.banner.bad{background:var(--bad-bg);border-color:var(--bad);color:var(--bad)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
.stat{background:var(--panel);border:1px solid var(--steel);border-radius:6px;padding:16px}
.stat b{display:block;font:800 40px/1 var(--display);font-stretch:75%;margin:6px 0}.stat span{font-size:14px;color:var(--ink-soft)}
.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:22px}.card{min-width:0}
.card{background:var(--panel);border:1px solid var(--steel);border-radius:6px}
.card h2{font-size:24px;font-weight:700;padding:16px 18px 0}.card .sub{color:var(--ink-soft);font-size:14px;padding:4px 18px 12px;margin:0}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:980px}td.mono{white-space:nowrap}
th{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);text-align:left;padding:10px 12px;border-top:1px solid var(--steel);border-bottom:1px solid var(--steel);background:var(--paper)}
td{padding:11px 12px;border-bottom:1px solid var(--steel);vertical-align:top}tr:last-child td{border-bottom:0}
.note{font-size:13px;color:var(--ink-soft);margin-top:3px}.over{color:var(--bad)}
.pill{display:inline-block;font:500 11.5px/1 var(--mono);padding:5px 8px;border-radius:999px;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:var(--ok)}.pill.warn{background:var(--warn-bg);color:var(--warn)}.pill.bad{background:var(--bad-bg);color:var(--bad)}.pill.mute{background:var(--mute-bg);color:var(--ink-soft)}
.bar{height:5px;background:var(--steel);border-radius:3px;margin-top:8px;max-width:150px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ok)}
.acts{white-space:nowrap}.inline{display:inline}
button{border:0;border-radius:4px;padding:10px 16px;font-weight:600;cursor:pointer;background:var(--brass);color:var(--brass-ink)}
button.small{padding:6px 10px;font-size:13px;margin:0 4px 4px 0}button.line{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--steel)}
form.hire{padding:4px 18px 18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 14px}form.hire .half{grid-column:span 2}
form.hire label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink-soft)}form.hire .full{grid-column:1/-1}
form.hire input,form.hire select,form.hire textarea{border:1px solid var(--steel);background:var(--paper);border-radius:4px;padding:9px 10px;font-size:15px;color:var(--ink);width:100%}
form.hire textarea{resize:vertical;min-height:64px}.empty{padding:26px 18px;color:var(--ink-soft)}
footer{color:var(--ink-soft);font-size:13px;padding-top:22px}
@media (max-width:980px){.stats{grid-template-columns:1fr 1fr}form.hire{grid-template-columns:1fr 1fr}form.hire .half{grid-column:1/-1}}
@media (max-width:520px){form.hire{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.title .btn{width:100%;text-align:center}}
.btn{display:inline-block;text-decoration:none;border-radius:4px;padding:10px 16px;font-weight:600;background:var(--brass);color:var(--brass-ink)}
</style></head><body>
<header><div class="wrap">
<a class="logo" href="/webhook/brewtec">BREWTEC <small>HR portal · Workday</small></a>
<nav><a href="#hire">Hire employee</a><a href="/webhook/brewtec/hr">Refresh</a><a href="/webhook/brewtec">Company website</a></nav>
</div></header>
<main class="wrap">
<div class="title"><div><div class="eyebrow">People Ops only</div><h1>New hires and onboarding</h1></div>
<p>Hires you complete here start onboarding automatically within 5 minutes. HR approves every welcome e-mail before it is sent.</p><a class="btn" href="#hire">+ Hire employee</a></div>
${banner}
<div class="stats">${stats.map(([l, v, s]) => `<div class="stat"><span>${esc(l)}</span><b>${v}</b><span>${esc(s)}</span></div>`).join('')}</div>
<div class="grid">
<section class="card" aria-labelledby="h-list"><h2 id="h-list">Hires in Workday</h2><p class="sub">${rows.length} hire(s), newest first</p>
${rows.length ? `<div class="scroll"><table><thead><tr><th>Worker</th><th>Name</th><th>Organization</th><th>Location</th><th>Hire date</th><th>Workday</th><th>Onboarding</th><th>Device, account</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div>`
  : '<p class="empty">No hires yet. Use Hire employee to add the first one.</p>'}
</section>
<section class="card" id="hire" aria-labelledby="h-hire"><h2 id="h-hire">Hire employee</h2><p class="sub">Creates the worker in Workday. Never enter tax, bank or social security numbers.</p>
<form class="hire" method="post" action="/webhook/brewtec/hr/hire">${ptField}
<label>First name<input name="first_name" required maxlength="60" autocomplete="off"></label>
<label>Last name<input name="last_name" required maxlength="60" autocomplete="off"></label>
<label class="half">Personal e-mail<input name="private_email" type="email" required maxlength="120" autocomplete="off"></label>
<label class="half">Supervisory organization<select name="department" required><option value="" disabled selected>Choose</option>${opt(['Engineering', 'Customer Success', 'Warehouse and Logistics', 'Marketing', 'Finance', 'Sales'])}</select></label>
<label class="half">Business title<input name="job_title" required maxlength="80"></label>
<label>Manager<input name="manager_name" required maxlength="80"></label>
<label>Manager e-mail<input name="manager_email" type="email" required maxlength="120" placeholder="name@brewtec.de"></label>
<label>Location<select name="site" required>${opt(['Koeln', 'Leverkusen'])}</select></label>
<label>Hire date<input name="start_date" type="date" required min="${today}"></label>
<label class="half">Hire status<select name="status" required><option>Successfully Completed</option><option>In Progress</option></select></label>
<label class="half">Comment for People Ops<textarea name="notes" maxlength="500" placeholder="Optional, no personal ID numbers"></textarea></label>
<div class="full"><button type="submit">Submit hire</button></div>
</form></section>
</div>
<footer>Mock of the BrewTec Workday tenant for the onboarding agent demo. Access is limited to HR by login. The page shows no private e-mail addresses and no personal access codes.</footer>
</main></body></html>`;

return [{ json: { html } }];
