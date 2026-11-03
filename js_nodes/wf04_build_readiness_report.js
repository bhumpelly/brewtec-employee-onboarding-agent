// Node: Build readiness report  (Workflow 4, JavaScript, Run Once for All Items)
// Turns day1_readiness rows into a GREEN, AMBER or RED report for People Ops.
const rows = $input.all().map(i => i.json);
const target = rows[0]?.target_date ?? '';
const starters = rows.filter(r => r.employee_id);

const counts = { GREEN: 0, AMBER: 0, RED: 0 };
const lines = starters.map(r => {
  const state = r.readiness || 'RED';
  counts[state] = (counts[state] || 0) + 1;
  return `${state}: ${r.first_name || ''} ${(r.last_name || ' ')[0]}., ${r.department || ''}, ${r.site || ''}. Missing: ${r.missing || 'nothing'}`;
});
const summary = starters.length
  ? `${starters.length} starter(s) on ${target}: ${counts.GREEN} GREEN, ${counts.AMBER} AMBER, ${counts.RED} RED`
  : `No approved starters on ${target}.`;

let discord = '**Day-1 readiness check**\n' + summary + (lines.length ? '\n' + lines.join('\n') : '');
if (discord.length > 1900) discord = discord.slice(0, 1897) + '...';
const email = `Hello People Ops,\n\nDay-1 readiness for ${target}.\n${summary}\n\n` +
  (lines.length ? lines.join('\n') + '\n\n' : '') +
  'Open the onboarding_overview view in Supabase for all open and overdue tasks.\n\n' +
  'This email was sent by the BrewTec onboarding agent daily scheduler.';

return [{ json: {
  discord_message: discord,
  email_subject: `Onboarding daily summary, day-1 readiness for ${target}`,
  email_body: email,
  starters: starters.length,
  red: counts.RED, amber: counts.AMBER, green: counts.GREEN,
} }];
