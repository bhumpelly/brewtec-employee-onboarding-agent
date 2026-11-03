// Node: Validate form  (Workflow 11, Personalfragebogen, JavaScript, Run Once for All Items)
// Checks the form before anything is stored. The values only live in memory here: this workflow
// saves no execution data (see Settings), so n8n never writes them to its own database.
//  1. IBAN: format and ISO 13616 checksum (mod 97). German IBANs must have 22 characters.
//  2. Tax ID (Steuer-ID): 11 digits, no leading zero, ISO 7064 MOD 11,10 check digit.
//  3. Social security number (Rentenversicherungsnummer): 8 digits, a letter, 3 digits, check digit.
//  4. Health insurer and tax class from the allowed values, personal code with 6 characters.
// Error messages never repeat the entered values.
// Forgery protection: the personal 48-character link token from the e-mail works like an
// anti-forgery token (another website cannot know it), and the personal code is required too.
// No browser header check: n8n serves webhook pages in a sandbox, so browsers always report
// the form as "cross-site" with origin "null", even when it is sent from the real form page.

function ibanValid(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('DE') && iban.length !== 22) return false;
  const moved = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of moved) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

function taxIdValid(id) {
  if (!/^[1-9]\d{10}$/.test(id)) return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(id[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  let check = 11 - product;
  if (check === 10) check = 0;
  return check === Number(id[10]);
}

function svValid(sv) {
  if (!/^\d{8}[A-Z]\d{3}$/.test(sv)) return false;
  const letter = String(sv.charCodeAt(8) - 64).padStart(2, '0');
  const digits = sv.slice(0, 8) + letter + sv.slice(9, 11);
  const weights = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const p = Number(digits[i]) * weights[i];
    sum += Math.floor(p / 10) + (p % 10);
  }
  return sum % 10 === Number(sv[11]);
}

const j = $input.first().json || {};
const b = j.body || {};
const clean = v => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const token = String(b.t ?? '').trim();
const code = clean(b.code).replace(/[^A-Z0-9]/g, '');
const iban = clean(b.iban);
const taxId = clean(b.tax_id);
const sv = clean(b.sv_number);
const insurer = String(b.health_insurer ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
const taxClass = String(b.tax_class ?? '').trim();

const errors = [];
if (!/^[a-f0-9]{48}$/.test(token)) errors.push('This link is not valid. Use the link from your e-mail.');
if (code.length !== 6) errors.push('Enter your 6-character personal code from the welcome e-mail.');
if (!ibanValid(iban)) errors.push('The IBAN is not valid. Please check it.');
if (!taxIdValid(taxId)) errors.push('The tax ID (Steuer-ID) is not valid. It has 11 digits and is on your tax letter or payslip.');
if (!svValid(sv)) errors.push('The social security number is not valid. It has 12 characters, for example 12 345678 A 123.');
if (!insurer) errors.push('Enter your health insurance.');
if (!/^[1-6]$/.test(taxClass)) errors.push('Choose your tax class.');

return [{ json: {
  valid: errors.length === 0,
  errors,
  token,
  code,
  iban,
  tax_id: taxId,
  sv_number: sv,
  health_insurer: insurer,
  tax_class: taxClass,
} }];
