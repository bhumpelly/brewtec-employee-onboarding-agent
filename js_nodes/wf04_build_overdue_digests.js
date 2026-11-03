// Node: Build overdue digests  (Workflow 4, JavaScript, Run Once for All Items)
// One Discord post per team that has overdue manual tasks.
const TEAM = {
  it: ['IT', 'discord_it_webhook'],
  facilities: ['Facilities', 'discord_facilities_webhook'],
  manager: ['Managers', 'discord_team_webhook'],
  hr: ['People Ops', 'discord_hr_webhook'],
  new_hire: ['People Ops (new hire tasks to follow up)', 'discord_hr_webhook'],
};
const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (!j.owner_team) continue;
  const [label, hookKey] = TEAM[j.owner_team] || ['People Ops', 'discord_hr_webhook'];
  const webhook = String(j[hookKey] ?? '').trim();
  if (!webhook) continue;
  let msg = `**Overdue onboarding tasks for ${label}: ${j.overdue_count ?? 0}**\n${j.lines ?? ''}`;
  if (msg.length > 1900) msg = msg.slice(0, 1897) + '...';
  out.push({ json: { team: j.owner_team, webhook, message: msg } });
}
return out;
