import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import Assignment from '../models/assignment.model';
import { getDepartmentForCategory } from '../services/router.service';
import { checkAndEscalate } from '../services/escalation.service';

// ─── Helper ────────────────────────────────────────────────────────────────────

function handleValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return true;
  }
  return false;
}

// ─── Create Assignment ─────────────────────────────────────────────────────────

/**
 * POST /api/assignments
 * Creates a new assignment by routing the issue to the correct department.
 */
export async function createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (handleValidationErrors(req, res)) return;

    const { issueId, category, wardId, zoneId, notes } = req.body;

    // Check if assignment already exists for this issue
    const existing = await Assignment.findOne({ issueId });
    if (existing) {
      res.status(409).json({
        success: false,
        error: `Assignment already exists for issue ${issueId}`,
        data: existing,
      });
      return;
    }

    // Route to the correct department
    const dept = getDepartmentForCategory(category);

    // Calculate due date: assignedAt + 3 days
    const assignedAt = new Date();
    const dueDate = new Date(assignedAt);
    dueDate.setDate(dueDate.getDate() + 3);

    const assignment = await Assignment.create({
      issueId,
      category: dept.category,
      departmentName: dept.departmentName,
      contactEmail: dept.contactEmail,
      wardId,
      zoneId: zoneId || 'default-zone',
      assignedTo: null,
      assignedAt,
      dueDate,
      status: 'pending',
      escalationLevel: 0,
      escalationDrafts: [],
      notes: notes || '',
    });

    res.status(201).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/assignments/route
 * Autonomous AI dispatch endpoint: accepts issueId, category, department, wardId, notes
 */
export async function routeAssignmentAI(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { issueId, category, department, wardId, zoneId, notes } = req.body;

    if (!issueId) {
      res.status(400).json({ success: false, error: 'issueId is required' });
      return;
    }

    // Check if assignment already exists
    const existing = await Assignment.findOne({ issueId });
    if (existing) {
      res.status(200).json({
        success: true,
        message: 'Assignment already exists',
        data: existing,
      });
      return;
    }

    const dept = getDepartmentForCategory(category || 'other');
    const assignedAt = new Date();
    const dueDate = new Date(assignedAt);
    dueDate.setDate(dueDate.getDate() + 3);

    const assignment = await Assignment.create({
      issueId,
      category: dept.category,
      departmentName: department || dept.departmentName,
      contactEmail: dept.contactEmail,
      wardId: wardId || 'ward-default',
      zoneId: zoneId || 'zone-default',
      assignedTo: null,
      assignedAt,
      dueDate,
      status: 'pending',
      escalationLevel: 0,
      escalationDrafts: [],
      notes: notes || `Auto-dispatched by CivicConnect AI Triage Agent to ${department || dept.departmentName}`,
    });

    res.status(201).json({
      success: true,
      message: 'Assignment routed successfully',
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get Assignment by issueId ────────────────────────────────────────────────

/**
 * GET /api/assignments/:issueId
 * Returns the assignment record for a specific issue.
 */
export async function getAssignmentByIssueId(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { issueId } = req.params;
    const assignment = await Assignment.findOne({ issueId });

    if (!assignment) {
      res.status(404).json({ success: false, error: `No assignment found for issue ${issueId}` });
      return;
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
}

// ─── Update Status ─────────────────────────────────────────────────────────────

/**
 * PUT /api/assignments/:id/status
 * Updates the status, assignee, or notes of an assignment.
 */
export async function updateAssignmentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (handleValidationErrors(req, res)) return;

    const { id } = req.params;
    const { status, assignedTo, notes } = req.body;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }

    // Apply updates
    assignment.status = status;
    if (assignedTo !== undefined) assignment.assignedTo = assignedTo;
    if (notes !== undefined) assignment.notes = notes;

    // If being assigned for the first time
    if (assignedTo && !assignment.assignedTo) {
      assignment.assignedAt = new Date();
    }

    await assignment.save();

    // Trigger escalation check after status update
    await checkAndEscalate(assignment);

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
}

// ─── List by Department ────────────────────────────────────────────────────────

/**
 * GET /api/assignments/department/:dept
 * Lists assignments for a given department with optional status filter and pagination.
 */
export async function listByDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { dept } = req.params;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build query — support partial department name match
    const query: Record<string, unknown> = {
      departmentName: { $regex: decodeURIComponent(dept), $options: 'i' },
    };
    if (status) query.status = status;

    const [assignments, total] = await Promise.all([
      Assignment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Assignment.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        assignments,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Stats Overview ────────────────────────────────────────────────────────────

/**
 * GET /api/assignments/stats/overview
 * Returns aggregated statistics: total, by status, by department, avg resolution time.
 */
export async function getStatsOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [
      totalCount,
      byStatus,
      byDepartment,
      avgResolutionResult,
    ] = await Promise.all([
      // Total count
      Assignment.countDocuments(),

      // Group by status
      Assignment.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Group by department
      Assignment.aggregate([
        {
          $group: {
            _id: '$departmentName',
            count: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Average resolution time (days) for completed assignments
      Assignment.aggregate([
        { $match: { status: 'completed' } },
        {
          $project: {
            resolutionTimeMs: { $subtract: ['$updatedAt', '$assignedAt'] },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionMs: { $avg: '$resolutionTimeMs' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const avgResolutionDays =
      avgResolutionResult.length > 0
        ? Math.round(avgResolutionResult[0].avgResolutionMs / (1000 * 60 * 60 * 24) * 100) / 100
        : null;

    // Format byStatus as a plain object
    const statusMap: Record<string, number> = {};
    for (const entry of byStatus) {
      statusMap[entry._id as string] = entry.count as number;
    }

    res.json({
      success: true,
      data: {
        total: totalCount,
        byStatus: statusMap,
        byDepartment,
        avgResolutionDays,
        resolvedCount: avgResolutionResult[0]?.count ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Approve Escalation Draft ──────────────────────────────────────────────────

/**
 * POST /api/assignments/:id/escalation/:draftIndex/approve
 * Approves a pending escalation draft (moves it to 'approved' status).
 */
export async function approveEscalationDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, draftIndex } = req.params;
    const idx = parseInt(draftIndex, 10);

    if (isNaN(idx) || idx < 0) {
      res.status(400).json({ success: false, error: 'Invalid draftIndex' });
      return;
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }

    if (idx >= assignment.escalationDrafts.length) {
      res.status(404).json({
        success: false,
        error: `Escalation draft at index ${idx} not found`,
      });
      return;
    }

    const draft = assignment.escalationDrafts[idx];
    if (draft.status !== 'pending_approval') {
      res.status(400).json({
        success: false,
        error: `Draft is already in status '${draft.status}'. Only 'pending_approval' drafts can be approved.`,
      });
      return;
    }

    assignment.escalationDrafts[idx].status = 'approved';
    await assignment.save();

    res.json({
      success: true,
      data: {
        assignment,
        approvedDraft: assignment.escalationDrafts[idx],
      },
    });
  } catch (error) {
    next(error);
  }
}
