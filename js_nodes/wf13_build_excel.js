// Node: Build Excel  (Workflow 13, JavaScript, Run Once for All Items)
// Builds one .xlsx workbook: a Summary sheet plus one sheet per test category.
// Written in plain JavaScript (no libraries): the sheets are XML files packed into a zip without compression.
// Output: xlsx_base64 and file_name. The next node turns the base64 text into the file.
const rows = $('Check replies').all().map(i => i.json);
const report = $('Build report').first().json;
const meta = $('Test cases').first().json;
const runAt = rows[0]?.run_at || '';
const runId = rows[0]?.run_id || String($execution.id);

// ---------- sheet content ----------
const cats = [...new Set(rows.map(r => r.category || 'General'))];
const count = (list, res) => list.filter(r => r.result === res).length;

const summary = [
  ['BrewTec automated chatbot tests'],
  ['Run', runAt],
  ['Execution', runId],
  ['Test file', meta.file_name || ''],
  ['Score', `${report.passed} of ${report.passed + report.failed} passed (${report.score}%)`],
  [],
  ['Category', 'Tests', 'Passed', 'Failed', 'Retry', 'Pass rate'],
  ...cats.map(c => {
    const g = rows.filter(r => (r.category || 'General') === c);
    const scored = g.length - count(g, 'retry');
    return [c, g.length, count(g, 'pass'), count(g, 'fail'), count(g, 'retry'), scored ? `${Math.round(100 * count(g, 'pass') / scored)}%` : ''];
  }),
  ['Total', rows.length, count(rows, 'pass'), count(rows, 'fail'), count(rows, 'retry'), `${report.score}%`],
];
const skipped = meta.skipped || [];
if (skipped.length) { summary.push([], ['Skipped rows in the test file']); skipped.forEach(s => summary.push([s])); }

const HEAD = ['Test', 'Question', 'Expected', 'Result', 'Detail', 'Reply'];
const sheets = [{ name: 'Summary', rows: summary, widths: [26, 12, 10, 10, 10, 12], headerRow: 7 }];
const used = new Set(['summary']);
for (const c of cats) {
  let name = c.replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'General';
  let n = 2; while (used.has(name.toLowerCase())) name = name.slice(0, 28) + ' ' + n++;
  used.add(name.toLowerCase());
  const g = rows.filter(r => (r.category || 'General') === c);
  sheets.push({ name, widths: [9, 45, 32, 9, 45, 80], headerRow: 1, resultCol: 3,
    rows: [HEAD, ...g.map(r => [r.id, r.question, r.expected, r.result, r.detail, r.reply])] });
}

// ---------- XML ----------
const esc = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// styles: 0 normal, 1 header, 2 pass, 3 fail, 4 retry, 5 wrapped text, 6 title
function sheetXml(sh) {
  const out = [];
  sh.rows.forEach((row, ri) => {
    const r = ri + 1;
    const cells = row.map((v, ci) => {
      const ref = colName(ci) + r;
      let s = 0;
      if (r === sh.headerRow) s = 1;
      else if (sh.name === 'Summary' && r === 1) s = 6;
      else if (sh.resultCol !== undefined && ci === sh.resultCol) s = v === 'pass' ? 2 : v === 'fail' ? 3 : v === 'retry' ? 4 : 0;
      else if (sh.name !== 'Summary' && r > 1 && [1, 2, 4, 5].includes(ci)) s = 5;
      if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    out.push(`<row r="${r}">${cells}</row>`);
  });
  const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const lastCol = colName(Math.max(...sh.rows.map(r => r.length), 1) - 1);
  const pane = sh.headerRow === 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = sh.headerRow === 1 && sh.rows.length > 1 ? `<autoFilter ref="A1:${lastCol}${sh.rows.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${out.join('')}</sheetData>${filter}</worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E1"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9F0D3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8D7D5"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCEFC7"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const files = [
  ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
  ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml', styles],
  ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
];

// ---------- zip (stored, no compression) ----------
function utf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) { c = 0x10000 + ((c - 0xD800) << 10) + (str.charCodeAt(++i) - 0xDC00); }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const u16 = v => [v & 255, (v >>> 8) & 255];
const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

const bytes = []; const central = [];
for (const [name, content] of files) {
  const nameB = utf8(name); const data = utf8(content); const crc = crc32(data); const offset = bytes.length;
  const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)];
  for (const x of [0x50, 0x4B, 0x03, 0x04, ...common, ...nameB]) bytes.push(x);
  for (const x of data) bytes.push(x);
  central.push([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameB]);
}
const cdStart = bytes.length; let cdSize = 0;
for (const c of central) { for (const x of c) bytes.push(x); cdSize += c.length; }
for (const x of [0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]) bytes.push(x);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let b64 = '';
for (let i = 0; i < bytes.length; i += 3) {
  const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
  b64 += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
}

const stamp = String(runAt).replace(/[: ]/g, '').replace(/^(\d{4}-\d{2}-\d{2})(\d{4})$/, '$1_$2');
return [{ json: { xlsx_base64: b64, file_name: `chatbot_test_results_${stamp || runId}.xlsx`, sheets: sheets.map(s => s.name) } }];
