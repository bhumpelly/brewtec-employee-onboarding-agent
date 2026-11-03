// Node: Rows  (Workflow 2, JavaScript, Run Once for All Items)
// Flattens the Notion database query into one item per page.
// Removes the https:// that Notion adds to URL columns, so sources stay clean slugs.
function readProp(prop) {
  if (!prop || typeof prop !== 'object') return '';
  const t = prop.type;
  if (t === 'title' || t === 'rich_text') return (prop[t] || []).map(r => r.plain_text || '').join('');
  if (t === 'url') return prop.url || '';
  if (t === 'select' || t === 'status') return (prop[t] || {}).name || '';
  if (t === 'multi_select') return (prop[t] || []).map(o => o.name || '').join(', ');
  if (t === 'files') return (prop.files || [])[0]?.name || '';
  if (t === 'unique_id') { const u = prop.unique_id || {}; return `${u.prefix || ''}-${u.number}`.replace(/^-|-$/g, ''); }
  return '';
}
function find(props, pattern, ptype) {
  for (const [name, prop] of Object.entries(props)) {
    if (ptype && prop?.type === ptype) return prop;
    if (pattern && pattern.test(name)) return prop;
  }
  return null;
}
const cleanFile = v => (v || '').trim().replace(/^https?:\/\//i, '').replace(/^\/+|\/+$/g, '').trim();
const PREFIX_TO_DEPT = { HR: 'HR', IT: 'IT', FIN: 'Finance', FAC: 'Facilities', GEN: 'General', ONB: 'Onboarding' };

const out = [];
const skipped = [];
for (const item of $input.all()) {
  for (const page of item.json.results || []) {
    if (page.archived || page.in_trash) continue;
    const props = page.properties || {};
    const title = readProp(find(props, null, 'title'));
    const docId = readProp(find(props, /doc\s*_?id/i));
    let department = readProp(find(props, /department/i));
    let file = cleanFile(readProp(find(props, /file/i)));
    const status = readProp(find(props, /^status$/i));

    if (status && !['published', 'live', 'approved'].includes(status.toLowerCase())) {
      skipped.push(`${title}: status ${status}`);
      continue;
    }
    if (!department && docId) department = PREFIX_TO_DEPT[docId.split('-')[0].toUpperCase()] || 'General';
    if (!file) file = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md';

    out.push({ json: { page_id: page.id, title, doc_id: docId, department: department || 'General', file, status } });
  }
}
if (!out.length) throw new Error('No published pages found in the Notion database. Skipped: ' + skipped.join('; '));
return out;
