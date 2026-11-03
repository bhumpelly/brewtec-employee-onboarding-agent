// Node: Map Workday fields  (Workflow 8, JavaScript, Run Once for All Items)
// Turns the Workday report (Report_Entry list) into one item per new hire, with the same field
// names as the People Ops form, so workflow 1 handles both sources the same way.
// Only completed hire processes start onboarding. "In Progress" (offer not final) and
// "Rescinded" (offer withdrawn) are skipped. Entries without the required fields are skipped too
// and counted, so a broken report never starts a half-empty onboarding.
const body = $input.first().json || {};
const entries = Array.isArray(body.Report_Entry) ? body.Report_Entry : [];
const REQUIRED = ['Worker_ID', 'Legal_Name_First_Name', 'Legal_Name_Last_Name', 'Personal_Email',
  'Supervisory_Organization', 'Business_Title', 'Manager', 'Manager_Email', 'Location', 'Hire_Date'];

// "Marketing (Mia Wagner)" -> "Marketing"   "BrewTec Koeln" -> "Koeln"
const orgToDepartment = org => String(org || '').replace(/\s*\(.*\)\s*$/, '').trim();
const locationToSite = loc => String(loc || '').replace(/^BrewTec\s+/i, '').trim();

const out = [];
let skippedIncomplete = 0;
let skippedNotCompleted = 0;
for (const e of entries) {
  if (String(e.Business_Process_Status || '') !== 'Successfully Completed') { skippedNotCompleted++; continue; }
  if (REQUIRED.some(k => !String(e[k] ?? '').trim())) { skippedIncomplete++; continue; }
  out.push({
    hris_id: String(e.Worker_ID),
    'First name': e.Legal_Name_First_Name,
    'Last name': e.Legal_Name_Last_Name,
    'Private email': e.Personal_Email,
    'Work email': e.Work_Email || '',
    'Department': orgToDepartment(e.Supervisory_Organization),
    'Job title': e.Business_Title,
    'Manager name': e.Manager,
    'Manager email': e.Manager_Email,
    'Site': locationToSite(e.Location),
    'Start date': String(e.Hire_Date).slice(0, 10),
    'Notes for People Ops': e.Comment || '',
    report_total: entries.length,
    skipped_not_completed: skippedNotCompleted,
    skipped_incomplete: skippedIncomplete,
  });
}
// Counters are final only after the loop
return out.map(o => ({ json: { ...o, skipped_not_completed: skippedNotCompleted,
  skipped_incomplete: skippedIncomplete } }));
