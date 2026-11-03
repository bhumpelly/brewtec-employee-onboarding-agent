// Node: Build team messages  (Workflow 1, JavaScript, Run Once for All Items)
// Splits the approved task plan by team. Builds the Discord posts and the Jira ticket list.
// Only first name and last initial go to Discord (data minimisation).
const truthy = v => ['true', '1', 'yes', 'on'].includes(String(v).trim().toLowerCase());
const clip = (s, n = 1900) => (s.length <= n ? s : s.slice(0, n - 3) + '...');

return $input.all().map(item => {
  const j = item.json;
  const hire = j.hire ?? {};
  const laptop = j.laptop ?? {};
  const account = j.account ?? {};
  let tasks = [];
  try { tasks = JSON.parse(hire.tasks_json || '[]'); } catch (e) { tasks = []; }

  const who = `${hire.first_name ?? ''} ${(hire.last_name || ' ')[0]}.`.trim();
  const head = `**New hire: ${who}**, ${hire.job_title ?? ''}, ${hire.department ?? ''}, ${hire.site ?? ''}, starts ${hire.start_date ?? ''}`;
  const lines = team => tasks.filter(t => t.team === team).map(t => `- ${t.title} (due ${t.due})`);

  const device = laptop.ok ? `Reserved device: ${laptop.asset_tag} (${laptop.model})` : `Device: ${laptop.message ?? 'not reserved'}`;
  const acc = `Planned account: ${account.upn ?? ''} (${account.mode ?? 'simulated'}, ${account.status ?? ''})`;

  const tickets = [];
  if (truthy(j.use_jira)) {
    for (const [team, project] of [['it', j.jira_it_project], ['facilities', j.jira_facilities_project]]) {
      if (!project) continue;
      // laptop_reserve is already done by the reserve_laptop function
      for (const t of tasks.filter(t => t.team === team && t.key !== 'laptop_reserve')) {
        tickets.push({
          project_key: String(project).trim(),
          summary: `${t.title} for ${who} (start ${hire.start_date ?? ''})`,
          issue_type: 'Task',
          description: `Onboarding task for ${who}, ${hire.department ?? ''}, ${hire.site ?? ''}. Due ${t.due}. ` +
            `Created by the BrewTec onboarding agent after HR approval.`,
          // jira_create_issue expects text for these, never null
          assignee: '',
          components: '',
          additional_fields: '{}',
        });
      }
    }
  }
  const githubOrg = String(j.github_org ?? '').trim();

  return { json: {
    employee_id: hire.employee_id ?? '',
    it_message: clip([head, device, acc, 'IT tasks:', ...lines('it')].join('\n')),
    facilities_message: clip([head, 'Facilities tasks:', ...lines('facilities')].join('\n')),
    team_message: clip([head, `Manager: ${hire.manager_name ?? ''}`, 'Manager tasks:', ...lines('manager')].join('\n')),
    needs_github: hire.department === 'Engineering' && Boolean(githubOrg),
    github_org: githubOrg,
    invite_email: hire.private_email ?? '',
    use_jira: tickets.length > 0,
    jira_ticket_count: tickets.length,
    jira_tickets_json: JSON.stringify(tickets),
  } };
});
