// Node: Render page  (Workflow 11, Employee Payroll Details , JavaScript, Run Once for All Items)
// One renderer for every page of the form: the form itself, the form with errors, and the
// messages for a used, expired, locked or unknown link and for success.
// Entered bank, tax or social security values are never written back into a page.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = name => { try { return $(name).first().json; } catch (e) { return null; } };

const j = $input.first().json || {};
const opened = safe('Open form');                 // GET: the webhook with ?t=...
const r = j.r || null;                            // result of pfb_open or pfb_submit
const validated = safe('Validate form');        // POST: the checked form
const token = String(j.token ?? (validated && validated.token) ?? (opened && opened.query ? opened.query.t : '') ?? '');
const okToken = /^[a-f0-9]{48}$/.test(token);

const MESSAGES = {
  unknown: ['This link is not valid', 'Use the newest link from your e-mail. If it still does not work, write to people@brewtec.de and People Ops sends you a new one.', 'bad'],
  used: ['Already submitted', 'Your Employee Payroll Details  was already received. To change your bank or tax details, write to payroll@brewtec.de.', 'ok'],
  expired: ['This link has expired', 'For your security the link works for 14 days. You get a new link with the next reminder e-mail, or write to people@brewtec.de.', 'bad'],
  locked: ['This link is locked', 'The personal code was entered wrongly 5 times, so the link was locked to protect your data. Write to people@brewtec.de for a new link.', 'bad'],
  error: ['The form is temporarily unavailable', 'Nothing was saved. Our team has been alerted. Please try again in a few minutes with the same link.', 'bad'],
};

let page = 'form';
let errors = Array.isArray(j.errors) ? j.errors : [];
let firstName = '';
let title = '', text = '', tone = '';

if (j.page === 'error') page = 'error';
else if (r && r.ok === true) page = 'done';
else if (r && r.valid === true) firstName = r.first_name || '';
else if (r && (r.reason === 'wrong_code')) {
  errors = [`The personal code is not correct. ${Number(r.attempts_left ?? 0)} attempt(s) left before the link is locked.`];
} else if (r && r.reason === 'format') {
  errors = ['Some details are not in the right format. Please check them and send the form again.'];
} else if (r && r.reason) page = r.reason in MESSAGES ? r.reason : 'unknown';
else if (!errors.length && !okToken) page = 'unknown';

if (page === 'done') {
  title = `Thank you${r.first_name ? ', ' + r.first_name : ''}`;
  text = 'Your Employee Payroll Details  was received. Your bank, tax and social security details were stored encrypted, and only the BrewTec payroll team can see them. You can close this page.';
  tone = 'ok';
} else if (page !== 'form') {
  [title, text, tone] = MESSAGES[page];
}

const style = `:root{--paper:#eef0ee;--panel:#f8f9f8;--steel:#d5d9d6;--ink:#1c1f1e;--ink-soft:#59605d;--brass:#a8761c;--brass-ink:#fffaf0;--graphite:#232726;
--ok:#2e7a4e;--ok-bg:#e3f1e8;--bad:#b5402f;--bad-bg:#f9e6e3;color-scheme:light;
--display:"Archivo","Arial Narrow",Arial,sans-serif;--body:"Source Sans 3","Segoe UI",system-ui,sans-serif;--mono:"JetBrains Mono",Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#141716;--panel:#1b1f1e;--steel:#2c3230;--ink:#e6e9e7;--ink-soft:#9ba39f;--brass:#d6a24a;--brass-ink:#1a1408;--graphite:#0d0f0e;
--ok:#6cc28f;--ok-bg:#16291e;--bad:#e07a6a;--bad-bg:#331d1a;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--paper);color:var(--ink);font:17px/1.6 var(--body)}
header{background:var(--graphite);color:#e9ece9}header div{max-width:760px;margin:0 auto;padding:14px 16px;font:800 22px/1 var(--display);font-stretch:75%;letter-spacing:.02em}
header small{font:500 12px/1 var(--mono);letter-spacing:.1em;color:#a9b0ad;text-transform:uppercase;margin-left:8px}
main{max-width:760px;margin:0 auto;padding:28px 16px 60px}
h1{font:800 clamp(30px,5vw,42px)/1.05 var(--display);font-stretch:78%;margin:6px 0 12px}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--brass)}
.lead{color:var(--ink-soft);margin:0 0 20px}
.card{background:var(--panel);border:1px solid var(--steel);border-radius:6px;padding:20px}
.errors{background:var(--bad-bg);border:1px solid var(--bad);color:var(--bad);border-radius:6px;padding:12px 16px;margin-bottom:16px}
.errors ul{margin:0;padding-left:18px}
.msg{border-radius:6px;padding:18px 20px;border:1px solid}.msg.ok{background:var(--ok-bg);border-color:var(--ok)}.msg.bad{background:var(--bad-bg);border-color:var(--bad)}
.msg h1{margin-top:0}
form{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}
label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--ink-soft)}label.full{grid-column:1/-1}
input,select{font:500 16px var(--mono);color:var(--ink);background:var(--paper);border:1px solid var(--steel);border-radius:4px;padding:10px;width:100%}
input:focus,select:focus{outline:2px solid var(--brass);outline-offset:1px}
small.hint{font-size:12.5px;color:var(--ink-soft)}
button{grid-column:1/-1;justify-self:start;border:0;border-radius:4px;padding:12px 20px;font:600 16px var(--body);background:var(--brass);color:var(--brass-ink);cursor:pointer}
.privacy{margin-top:22px;font-size:14px;color:var(--ink-soft)}.privacy h2{font:700 20px/1.2 var(--display);font-stretch:80%;color:var(--ink);margin:0 0 6px}
.privacy ul{padding-left:18px;margin:6px 0}
@media (max-width:560px){form{grid-template-columns:1fr}}`;

const privacy = `<section class="privacy"><h2>How your data is protected</h2><ul>
<li><b>Purpose:</b> salary payment, wage tax (ELStAM) and social insurance registration. BrewTec is legally required to process these details as your employer.</li>
<li><b>Who can see it:</b> only the payroll team. HR and the onboarding assistant only see that the form was received and a masked IBAN.</li>
<li><b>Protection:</b> sent over an encrypted connection and stored encrypted (AES-256). Every view by payroll is logged.</li>
<li><b>How long:</b> as long as the law requires for payroll records, then deleted.</li>
<li><b>Questions or corrections:</b> payroll@brewtec.de. Never send these details by e-mail or chat.</li></ul></section>`;

const insurers = ['Techniker Krankenkasse (TK)', 'AOK Rheinland/Hamburg', 'BARMER', 'DAK-Gesundheit', 'IKK classic', 'KKH', 'hkk', 'Private Krankenversicherung'];
const body = page === 'form' ? `
<div class="eyebrow">Employee Payroll Details </div>
<h1>${firstName ? 'Hello ' + esc(firstName) + ', your' : 'Your'} payroll details</h1>
<p class="lead">Payroll needs these details to pay your first salary on time. It takes about 3 minutes.</p>
${errors.length ? `<div class="errors" role="alert"><ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
<div class="card"><form method="post" action="/webhook/brewtec/pfb/submit" autocomplete="off">
<input type="hidden" name="t" value="${esc(token)}">
<label class="full">Personal code from your welcome e-mail<input name="code" required maxlength="6" autocomplete="one-time-code" spellcheck="false"></label>
<label class="full">IBAN<input name="iban" required maxlength="42" inputmode="text" spellcheck="false" placeholder="DE00 0000 0000 0000 0000 00"><small class="hint">The account your salary is paid into.</small></label>
<label>Tax ID (Steuer-ID)<input name="tax_id" required maxlength="14" inputmode="numeric" spellcheck="false" placeholder="11 digits"></label>
<label>Tax class (Steuerklasse)<select name="tax_class" required><option value="" disabled selected>Choose</option>${[1, 2, 3, 4, 5, 6].map(n => `<option>${n}</option>`).join('')}</select></label>
<label>Social security number<input name="sv_number" required maxlength="16" spellcheck="false" placeholder="12 345678 A 123"></label>
<label>Health insurance<input name="health_insurer" required maxlength="80" list="insurers"><datalist id="insurers">${insurers.map(i => `<option value="${esc(i)}">`).join('')}</datalist></label>
<button type="submit">Send securely</button>
</form></div>${privacy}` : `
<div class="msg ${tone}"><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${page === 'done' ? '' : privacy}`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="same-origin"><title>BrewTec Employee Payroll Details </title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>${style}</style></head><body><header><div>BREWTEC <small>Employee self-service</small></div></header><main>${body}</main></body></html>`;

return [{ json: { html, status: page === 'form' || page === 'done' ? 200 : (page === 'error' ? 503 : 410) } }];
