// Node: Build report  (Workflow 9, mock Workday, JavaScript, Run Once for All Items)
// Shapes the rows like a Workday custom report served as a web service (RaaS, format=json):
// { "Report_Entry": [ { "Worker_ID": ..., "Legal_Name_First_Name": ..., ... } ] }
// The report only exposes what onboarding needs (data minimisation): no salary, no birth date,
// no bank or tax data.
const rows = $input.all().map(i => i.json).filter(r => r && r.Worker_ID);
return [{ json: {
  Report_Entry: rows.map(r => ({
    Worker_ID: String(r.Worker_ID),
    Legal_Name_First_Name: r.Legal_Name_First_Name,
    Legal_Name_Last_Name: r.Legal_Name_Last_Name,
    Personal_Email: r.Personal_Email,
    Work_Email: r.Work_Email || '',
    Supervisory_Organization: r.Supervisory_Organization,
    Business_Title: r.Business_Title,
    Manager: r.Manager,
    Manager_Email: r.Manager_Email,
    Location: r.Location,
    Hire_Date: r.Hire_Date,
    Business_Process: 'Hire Employee',
    Business_Process_Status: r.Business_Process_Status,
    Comment: r.Comment || '',
  })),
} }];
