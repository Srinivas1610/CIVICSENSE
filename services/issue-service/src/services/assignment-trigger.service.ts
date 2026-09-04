import axios from 'axios';
import { IIssueDocument } from '../models/issue.model';

// ─── Assignment Trigger Service ───────────────────────────────────────────────
// After an issue receives DNA analysis, notify the assignment-service
// to auto-assign the issue to the relevant department/worker.

const ASSIGNMENT_SERVICE_URL =
  process.env.ASSIGNMENT_SERVICE_URL || 'http://assignment-service:3003';

export interface AssignmentPayload {
  issueId: string;
  wardId: string;
  wardName: string;
  category: string;
  classification: string;
  severityScore: number;
  department: {
    name: string;
    zoneId: string;
    contactEmail: string;
  };
  resolutionETA: string | null;
}

export async function triggerAssignment(issue: IIssueDocument): Promise<void> {
  if (!issue.dna) {
    console.warn(`[assignment-trigger] Issue ${issue._id} has no DNA, skipping assignment trigger`);
    return;
  }

  const payload: AssignmentPayload = {
    issueId: String(issue._id),
    wardId: issue.location.wardId,
    wardName: issue.location.wardName,
    category: issue.category,
    classification: issue.dna.classification,
    severityScore: issue.dna.severityScore,
    department: issue.dna.department,
    resolutionETA: issue.dna.resolutionETA,
  };

  try {
    const response = await axios.post(
      `${ASSIGNMENT_SERVICE_URL}/api/assignments`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );
    console.log(
      `[assignment-trigger] Assignment created for issue ${issue._id}:`,
      response.data
    );
  } catch (err) {
    const error = err as Error;
    // Non-critical: log but do not throw — issue was already saved with DNA
    console.error(
      `[assignment-trigger] Failed to create assignment for issue ${issue._id}:`,
      error.message
    );
  }
}
