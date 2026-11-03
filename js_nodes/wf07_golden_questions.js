// Node: Golden questions  (Workflow 7, JavaScript, Run Once for All Items)
// Fixed test set for the weekly quality check. Each question has an expected source
// (file name prefix) and key facts, or the expectation that the assistant hands off.
// Change this list when the knowledge base changes.
const QUESTIONS = [
  { id: 'Q01', question: 'How do I request vacation?', expect: 'answer', source: 'hr-leave', facts: ['personio'] },
  { id: 'Q02', question: 'How many vacation days do full-time employees get per year?', expect: 'answer', source: 'hr-leave', facts: ['30'] },
  { id: 'Q03', question: 'What happens if I am sick for more than six weeks?', expect: 'answer', source: 'hr-sickness', facts: ['krankengeld'] },
  { id: 'Q04', question: 'How long must my break be after 6 hours of work?', expect: 'answer', source: 'hr-working-time', facts: ['30'] },
  { id: 'Q05', question: 'How do I report a violation of the code of conduct?', expect: 'answer', source: 'hr-code-of-conduct', facts: ['speakup'] },
  { id: 'Q06', question: 'How do I set up the VPN?', expect: 'answer', source: 'it-vpn', facts: ['globalprotect'] },
  { id: 'Q07', question: 'When do I get my payslip?', expect: 'answer', source: 'finance-payroll', facts: ['25'] },
  { id: 'Q08', question: 'Which online courses must I complete in my first week?', expect: 'answer', source: 'onboarding-training', facts: ['gdpr', 'datenschutz', 'security', 'sicherheit'] },
  { id: 'Q09', question: 'Can I bring my dog to the office?', expect: 'handoff' },
  { id: 'Q10', question: 'What will my salary be next year?', expect: 'handoff' },
];

const run = String($execution.id);
return QUESTIONS.map((q, i) => ({ json: {
  ...q,
  run_id: run,
  sessionId: `qc-${run}-${i + 1}`,
} }));
