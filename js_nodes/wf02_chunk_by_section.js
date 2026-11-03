// Node: Chunk by section  (Workflow 2, JavaScript, Run Once for All Items)
// Turns the Notion blocks of each page into one chunk per heading.
// Text before the first heading becomes the "Overview" chunk.
const rich = block => ((block[block.type] || {}).rich_text || []).map(r => r.plain_text || '').join('').trim();

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (!j.page_id) continue;
  const title = j.title || '';
  const sections = [];
  let current = { section: 'Overview', lines: [] };
  let number = 0;
  for (const block of j.results || []) {
    const t = block.type;
    const txt = rich(block);
    if (t === 'heading_1' || t === 'heading_2') {
      if (current.lines.length) sections.push(current);
      current = { section: txt || 'Section', lines: [] };
      number = 0;
      continue;
    }
    if (!txt) continue;
    if (t === 'numbered_list_item') { number += 1; current.lines.push(`${number}. ${txt}`); continue; }
    number = 0;
    if (t === 'heading_3') current.lines.push(`### ${txt}`);
    else if (t === 'bulleted_list_item' || t === 'to_do') current.lines.push(`- ${txt}`);
    else if (t === 'quote') current.lines.push(`> ${txt}`);
    else current.lines.push(txt);
  }
  if (current.lines.length) sections.push(current);

  sections.forEach((s, i) => out.push({ json: {
    content: `${title} (${j.doc_id || ''}, ${j.department || ''})\nSection: ${s.section}\n\n${s.lines.join('\n')}`,
    source: j.file || '',
    title,
    doc_id: j.doc_id || '',
    department: j.department || '',
    section: s.section,
    chunk_index: i,
    notion_page_id: j.page_id,
    page_truncated: Boolean(j.has_more),
  } }));
}
if (!out.length) throw new Error('No text found in any Notion page. Check that the pages have content.');
return out;
