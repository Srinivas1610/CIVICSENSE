import cron from 'node-cron';
import Assignment, { IAssignmentDocument, IEscalationDraft } from '../models/assignment.model';

// ─── Escalation Configuration ─────────────────────────────────────────────────

/**
 * Escalation ladder configuration.
 * daysAfterAssignment: days after assignedAt when this level triggers
 */
export const ESCALATION_LADDER = [
  { level: 1 as const, daysAfterAssignment: 3,  type: 'follow_up' as const,          label: 'Follow-up Reminder' },
  { level: 2 as const, daysAfterAssignment: 7,  type: 'senior_escalation' as const,   label: 'Senior Officer Escalation' },
  { level: 3 as const, daysAfterAssignment: 14, type: 'rti' as const,                 label: 'RTI Application Draft' },
  { level: 4 as const, daysAfterAssignment: 21, type: 'social_pack' as const,         label: 'Social Pressure Pack' },
];

// ─── Content Generator ─────────────────────────────────────────────────────────

/**
 * Generates realistic escalation message content for each level.
 *
 * @param level - Escalation level (1-4)
 * @param issueId - The civic issue ID
 * @param departmentName - The responsible department name
 * @param contactEmail - The department contact email
 * @returns Formatted escalation content string
 */
export function generateEscalationContent(
  level: 1 | 2 | 3 | 4,
  issueId: string,
  departmentName: string,
  contactEmail: string
): string {
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  switch (level) {
    case 1:
      return [
        `FOLLOW-UP REMINDER — Issue #${issueId}`,
        `Date: ${date}`,
        ``,
        `Dear ${departmentName} Team,`,
        ``,
        `This is a courteous follow-up regarding civic Issue #${issueId} reported by a citizen`,
        `through the CivicConnect platform. The issue has been pending for 3 days without`,
        `acknowledgment or resolution.`,
        ``,
        `We kindly request you to:`,
        `  1. Acknowledge receipt of this issue within 24 hours`,
        `  2. Assign a responsible field officer`,
        `  3. Provide an estimated resolution timeline`,
        ``,
        `Please update the status via the CivicConnect portal or reply to this email.`,
        `Contact: ${contactEmail}`,
        ``,
        `Regards,`,
        `CivicConnect Automated Escalation System`,
      ].join('\n');

    case 2:
      return [
        `SENIOR OFFICER ESCALATION — Issue #${issueId}`,
        `Date: ${date}`,
        ``,
        `To: Senior Officer / Department Head, ${departmentName}`,
        `CC: ${contactEmail}`,
        ``,
        `Subject: Unresolved Civic Issue Requiring Immediate Attention — Ref #${issueId}`,
        ``,
        `Dear Sir/Madam,`,
        ``,
        `I am writing to bring to your urgent attention civic Issue #${issueId}, which was reported`,
        `7 days ago and remains unresolved despite an initial follow-up reminder sent on Day 3.`,
        ``,
        `This matter requires your personal intervention to ensure timely resolution.`,
        `Citizen satisfaction metrics are directly impacted by delayed responses.`,
        ``,
        `Immediate actions requested:`,
        `  1. Personally review and prioritize Issue #${issueId}`,
        `  2. Escalate to field supervisor for urgent site inspection`,
        `  3. Provide a resolution commitment with a firm date`,
        `  4. Update the CivicConnect portal with current status`,
        ``,
        `Further delays may necessitate escalation to the RTI framework.`,
        ``,
        `Regards,`,
        `CivicConnect Grievance Management Cell`,
      ].join('\n');

    case 3:
      return [
        `RTI APPLICATION DRAFT — Issue #${issueId}`,
        `Date: ${date}`,
        ``,
        `[DRAFT — Pending Citizen Approval Before Filing]`,
        ``,
        `To,`,
        `The Public Information Officer (PIO),`,
        `${departmentName}`,
        ``,
        `Subject: Application under Right to Information Act, 2005`,
        ``,
        `Sir/Madam,`,
        ``,
        `I, a citizen of India, hereby request the following information under Section 6 of`,
        `the Right to Information Act, 2005, regarding civic Issue Reference #${issueId}:`,
        ``,
        `  1. What is the current status of Issue #${issueId} reported 14 days ago?`,
        `  2. To whom was this issue assigned and on what date?`,
        `  3. What actions have been taken to date?`,
        `  4. What is the prescribed SLA for this category of complaint?`,
        `  5. Why has the prescribed SLA been breached?`,
        `  6. What disciplinary action, if any, has been initiated?`,
        ``,
        `I request the information within 30 days as mandated by the RTI Act.`,
        `Application fee of Rs. 10 is enclosed/to be paid at submission.`,
        ``,
        `Yours sincerely,`,
        `[Citizen Name — To Be Filled]`,
        `[Contact — To Be Filled]`,
      ].join('\n');

    case 4:
      return [
        `SOCIAL PRESSURE PACK — Issue #${issueId}`,
        `Date: ${date}`,
        ``,
        `[DRAFT — Ready for Citizen Social Media Dissemination]`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📣 TWITTER/X DRAFT:`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `@${departmentName.replace(/\s+/g, '')} Issue #${issueId} has been UNRESOLVED for 21 DAYS.`,
        `RTI filed. Escalated to senior officers. Still waiting. #CivicConnect #Accountability`,
        `#CitizenRights #${departmentName.split(' ')[0]}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📰 COMMUNITY NOTICE DRAFT:`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `ATTENTION CITIZENS: Civic Issue #${issueId} assigned to ${departmentName}`,
        `has remained unresolved for 21 days. A formal RTI application has been filed.`,
        `Fellow citizens who have experienced similar delays are encouraged to file`,
        `their own RTI applications to create systemic accountability.`,
        ``,
        `Contact: ${contactEmail}`,
        `Reference: CivicConnect Issue #${issueId}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📝 WARD COMMITTEE LETTER DRAFT:`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `To the Ward Committee Chairperson,`,
        ``,
        `We, the undersigned citizens, request your intervention in resolving Issue #${issueId}`,
        `which has been pending with ${departmentName} for 21 days despite multiple escalations.`,
        `We urge you to raise this at the next ward committee meeting and seek accountability.`,
      ].join('\n');

    default:
      return `Escalation content for Issue #${issueId} — Level ${level}`;
  }
}

// ─── Core Escalation Logic ─────────────────────────────────────────────────────

/**
 * Checks if an assignment should be escalated based on current date vs assignedAt.
 * Generates and appends the next escalation draft if conditions are met.
 *
 * @param assignment - Mongoose assignment document
 * @returns true if a new draft was generated, false otherwise
 */
export async function checkAndEscalate(assignment: IAssignmentDocument): Promise<boolean> {
  // Do not escalate completed assignments
  if (assignment.status === 'completed') return false;

  const now = new Date();
  const assignedAt = new Date(assignment.assignedAt);
  const daysSinceAssigned = Math.floor(
    (now.getTime() - assignedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Find the next escalation level that should be triggered
  const nextLevel = ESCALATION_LADDER.find(
    (ladder) =>
      ladder.level > assignment.escalationLevel &&
      daysSinceAssigned >= ladder.daysAfterAssignment
  );

  if (!nextLevel) return false;

  // Check if a draft for this level already exists
  const existingDraft = assignment.escalationDrafts.find(
    (d) => d.level === nextLevel.level
  );
  if (existingDraft) return false;

  // Generate escalation content
  const content = generateEscalationContent(
    nextLevel.level,
    assignment.issueId,
    assignment.departmentName,
    assignment.contactEmail
  );

  const newDraft: IEscalationDraft = {
    level: nextLevel.level,
    type: nextLevel.type,
    content,
    status: 'pending_approval',
    generatedAt: new Date(),
  };

  // Update assignment
  assignment.escalationDrafts.push(newDraft);
  assignment.escalationLevel = nextLevel.level;
  assignment.status = 'escalated';

  await assignment.save();

  console.log(
    `[EscalationService] Issue #${assignment.issueId} escalated to Level ${nextLevel.level} (${nextLevel.label})`
  );

  return true;
}

/**
 * Runs the escalation check for all non-completed assignments.
 * Called by the cron job.
 */
export async function runEscalationCheck(): Promise<void> {
  try {
    console.log('[EscalationService] Running scheduled escalation check...');

    const assignments = await Assignment.find({
      status: { $nin: ['completed'] },
      escalationLevel: { $lt: 4 },
    });

    let escalatedCount = 0;
    for (const assignment of assignments) {
      const wasEscalated = await checkAndEscalate(assignment);
      if (wasEscalated) escalatedCount++;
    }

    console.log(
      `[EscalationService] Check complete. Checked: ${assignments.length}, Escalated: ${escalatedCount}`
    );
  } catch (error) {
    console.error('[EscalationService] Error during escalation check:', error);
  }
}

// ─── Cron Job ─────────────────────────────────────────────────────────────────

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Starts the escalation cron job (runs every hour).
 */
export function startEscalationCron(): void {
  if (cronJob) {
    console.log('[EscalationService] Cron already running.');
    return;
  }

  // Run every hour: "0 * * * *"
  cronJob = cron.schedule('0 * * * *', async () => {
    await runEscalationCheck();
  });

  console.log('[EscalationService] Escalation cron started (every hour).');
}

/**
 * Stops the escalation cron job.
 */
export function stopEscalationCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[EscalationService] Escalation cron stopped.');
  }
}
