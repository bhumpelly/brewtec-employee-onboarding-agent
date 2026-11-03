// Node: Render page  (Workflow 12, payroll portal, JavaScript, Run Once for All Items)
// Two pages: the list (no decrypted values, masked IBAN only) and the detail page of one person
// (decrypted, opened only by a button so the id is never in the address bar or browser history).
// Every value is HTML-escaped. This workflow saves no execution data, so decrypted values are
// never written to n8n's database.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = name => { try { return $(name).first().json; } catch (e) { return null; } };
const list = safe('Payroll list page');
// Signed page token: from "Issue page token" on the list, or the token the Open button sent on a
// record page. Every form sends it back (hidden field pt).
const pageToken = String((safe('Issue page token') || {}).page_token || ((safe('Open record') || {}).body || {}).pt || '');
const ptField = `<input type="hidden" name="pt" value="${esc(pageToken)}">`;
const q = (list && list.query) || {};
const items = $input.all().map(i => i.json);
const v = items.length === 1 && items[0].v ? items[0].v : null;
const detail = v && v.found !== false ? v : null;
const notFound = !!(v && v.found === false);

const fmtIban = s => String(s || '').replace(/(.{4})/g, '$1 ').trim();
const fmtSv = s => { const v = String(s || ''); return v.length === 12 ? `${v.slice(0, 2)} ${v.slice(2, 8)} ${v.slice(8, 9)} ${v.slice(9)}` : v; };
   // Dates and times are shown in Berlin time. n8n turns a database date into "midnight Berlin",
   // which is 23:00 of the previous day in UTC, so cutting the UTC text would show the wrong day.
   const berlin = (s, withTime) => {
     if (!s) return '';
     const str = String(s);
     if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
     const d = new Date(str);
     if (isNaN(d)) return str.slice(0, withTime ? 16 : 10);
     const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
       day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
     return `${p.year}-${p.month}-${p.day}` + (withTime ? ` ${p.hour}:${p.minute}` : '');
   };
   const fmtDate = s => berlin(s, false);
   const fmtTime = s => berlin(s, true);

const style = `:root{--paper:#eef0ee;--panel:#f8f9f8;--steel:#d5d9d6;--ink:#1c1f1e;--ink-soft:#59605d;--brass:#a8761c;--brass-ink:#fffaf0;--graphite:#232726;
--ok:#2e7a4e;--ok-bg:#e3f1e8;--warn:#8a5d10;--warn-bg:#fbf1dc;--bad:#b5402f;--bad-bg:#f9e6e3;--mute-bg:#e3e6e4;color-scheme:light;
--display:"Archivo","Arial Narrow",Arial,sans-serif;--body:"Source Sans 3","Segoe UI",system-ui,sans-serif;--mono:"JetBrains Mono",Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#141716;--panel:#1b1f1e;--steel:#2c3230;--ink:#e6e9e7;--ink-soft:#9ba39f;--brass:#d6a24a;--brass-ink:#1a1408;--graphite:#0d0f0e;
--ok:#6cc28f;--ok-bg:#16291e;--warn:#e0b25c;--warn-bg:#2f2716;--bad:#e07a6a;--bad-bg:#331d1a;--mute-bg:#262b29;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--paper);color:var(--ink);font:16px/1.55 var(--body)}
header{background:var(--graphite);color:#e9ece9}header .in{max-width:1100px;margin:0 auto;padding:14px 16px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.logo{font:800 22px/1 var(--display);font-stretch:75%;letter-spacing:.02em}.logo small{font:500 12px/1 var(--mono);letter-spacing:.1em;color:#a9b0ad;text-transform:uppercase;margin-left:8px}
header a{color:#c3c9c6;font-size:14px;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:26px 16px 60px}
h1{font:800 clamp(30px,4.4vw,44px)/1.05 var(--display);font-stretch:78%;margin:6px 0 10px}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--brass)}
.lead{color:var(--ink-soft);margin:0 0 18px;max-width:46em}
.banner{padding:12px 16px;border-radius:6px;margin-bottom:16px;border:1px solid}.banner.ok{background:var(--ok-bg);border-color:var(--ok);color:var(--ok)}.banner.bad{background:var(--bad-bg);border-color:var(--bad);color:var(--bad)}
.card{background:var(--panel);border:1px solid var(--steel);border-radius:6px;min-width:0}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:820px}
th{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);text-align:left;padding:10px 12px;border-bottom:1px solid var(--steel);background:var(--paper)}
td{padding:11px 12px;border-bottom:1px solid var(--steel);vertical-align:middle}tr:last-child td{border-bottom:0}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}td.mono{white-space:nowrap}td:first-child{min-width:170px}.note{font-size:13px;color:var(--ink-soft)}
.pill{display:inline-block;font:500 11.5px/1 var(--mono);padding:5px 8px;border-radius:999px;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:var(--ok)}.pill.warn{background:var(--warn-bg);color:var(--warn)}.pill.mute{background:var(--mute-bg);color:var(--ink-soft)}
button{border:0;border-radius:4px;padding:8px 14px;font:600 14px var(--body);background:var(--brass);color:var(--brass-ink);cursor:pointer}
button.line{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--steel)}
form.inline{display:inline}
dl{display:grid;grid-template-columns:220px 1fr;margin:0}dt,dd{padding:12px 18px;border-bottom:1px solid var(--steel);margin:0}dt{color:var(--ink-soft);font-size:14px}
dd{font:500 17px var(--mono);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}dl>:nth-last-child(-n+2){border-bottom:0}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.warnbox{background:var(--warn-bg);border:1px solid var(--warn);color:var(--ink);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:14px}
@media (max-width:600px){dl{grid-template-columns:1fr}dt{border-bottom:0;padding-bottom:0}}`;

function wrap(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="same-origin"><title>BrewTec Payroll</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>${style}</style></head><body><header><div class="in"><span class="logo">BREWTEC <small>Payroll · restricted</small></span>
<a href="/webhook/brewtec/payroll">All employees</a></div></header><main>${inner}</main></body></html>`;
}

let html;
if (notFound) {
  html = wrap('<div class="eyebrow">Payroll</div><h1>No payroll details for this employee</h1><p class="lead">The employee has not submitted the form yet, or the record was deleted.</p><a href="/webhook/brewtec/payroll"><button class="line" type="button">Back to the list</button></a>');
} else if (detail) {
  const d = detail;
  const exported = d.exported_at ? `<span class="pill ok">Exported ${esc(fmtTime(d.exported_at))} by ${esc(d.exported_by)}</span>` : '<span class="pill warn">Not exported yet</span>';
  html = wrap(`<div class="eyebrow">Payroll record · this view is logged</div><h1>${esc(d.name)}</h1>
<p class="lead">${esc(d.department)}, start ${esc(fmtDate(d.start_date))}${d.worker_id ? ', Workday worker ' + esc(d.worker_id) : ''}. Submitted by the employee on ${esc(fmtTime(d.submitted_at))}. ${exported}</p>
<div class="warnbox">Confidential. Do not copy these details into e-mail, chat or tickets. Transfer them only to the payroll system (DATEV).</div>
<div class="card"><dl>
<dt>IBAN</dt><dd>${esc(fmtIban(d.iban))}</dd>
<dt>Tax ID (Steuer-ID)</dt><dd>${esc(d.tax_id)}</dd>
<dt>Tax class</dt><dd>${esc(d.tax_class)}</dd>
<dt>Social security number</dt><dd>${esc(fmtSv(d.sv_number))}</dd>
<dt>Health insurance</dt><dd>${esc(d.health_insurer)}</dd>
</dl></div>
<div class="actions">
<form method="post" action="/webhook/brewtec/payroll/export" class="inline">${ptField}<input type="hidden" name="employee_id" value="${esc(d.employee_id)}"><button type="submit">Mark as transferred to DATEV</button></form>
<a href="/webhook/brewtec/payroll"><button class="line" type="button">Back to the list</button></a></div>`);
} else {
  const rows = items.filter(r => r && r.employee_id);
  const pill = s => s === 'received' ? '<span class="pill ok">Received</span>' : s === 'link sent' ? '<span class="pill warn">Link sent</span>' : '<span class="pill mute">Not sent yet</span>';
  const banner = q.msg ? `<div class="banner ${q.ok === '1' ? 'ok' : 'bad'}" role="status">${esc(q.msg)}</div>` : '';
  const open = r => r.pfb_status === 'received'
    ? `<form method="post" action="/webhook/brewtec/payroll/view" class="inline">${ptField}<input type="hidden" name="employee_id" value="${esc(r.employee_id)}"><button type="submit">Open</button></form>` : '';
  const toDo = rows.filter(r => r.pfb_status === 'received' && !r.exported_at).length;
  html = wrap(`<div class="eyebrow">Payroll team only</div><h1>Employee payroll details</h1>
<p class="lead">${toDo} record(s) ready to transfer to DATEV. Bank, tax and social security details are stored encrypted and are decrypted only when you open a record. Every opening is logged with your login.</p>
${banner}
<div class="card">${rows.length ? `<div class="scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Start</th><th>Form</th><th>IBAN</th><th>Health insurance</th><th>DATEV</th><th></th></tr></thead><tbody>
${rows.map(r => `<tr><td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong>${r.worker_id ? `<div class="note mono">Worker ${esc(r.worker_id)}</div>` : ''}</td>
<td>${esc(r.department)}</td><td class="mono">${esc(fmtDate(r.start_date))}</td><td>${pill(r.pfb_status)}</td>
<td class="mono">${esc(r.iban_masked || '')}</td><td>${esc(r.health_insurer || '')}</td>
<td>${r.exported_at ? `<span class="pill ok">Transferred</span><div class="note">${esc(fmtTime(r.exported_at))}</div>` : (r.pfb_status === 'received' ? '<span class="pill warn">To do</span>' : '')}</td>
<td>${open(r)}</td></tr>`).join('')}</tbody></table></div>` : '<p style="padding:20px;color:var(--ink-soft)">No approved new hires yet.</p>'}</div>`);
}
return [{ json: { html } }];
