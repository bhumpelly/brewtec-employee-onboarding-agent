// Node: Unwrap claimed  (Workflow 8, JavaScript, Run Once for All Items)
// The claim query returns each claimed worker as one JSON document. This turns them back into
// plain items with the form field names, one item per hire, for workflow 1.
return $input.all()
  .map(i => i.json.doc)
  .filter(d => d && d.hris_id)
  .map(d => ({ json: d }));
