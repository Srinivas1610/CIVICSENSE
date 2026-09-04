import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Issue, { IssueStatus, IssueCategory, ValidationResponse } from '../models/issue.model';
import { analyzeIssueDNA } from '../services/dna.service';
import { triggerAssignment } from '../services/assignment-trigger.service';
import { triggerStatusChangeNotification } from '../services/notification-trigger.service';

// ─── Helper ───────────────────────────────────────────────────────────────────

function handleValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return true;
  }
  return false;
}

// ─── CREATE ISSUE ─────────────────────────────────────────────────────────────

export const createIssue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { reportedBy, rawDescription, location, channel, media, category } = req.body;

    const issue = new Issue({
      reportedBy,
      rawDescription,
      location,
      channel: channel || 'app',
      media: media || [],
      category: category || 'other',
      status: 'pending',
      validationCount: 0,
      escalationLevel: 0,
      dna: null,
    });

    await issue.save();

    res.status(201).json({
      success: true,
      data: issue,
    });
  } catch (err) {
    next(err);
  }
};

// ─── LIST ISSUES ──────────────────────────────────────────────────────────────

export const listIssues = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      status,
      category,
      wardId,
      reportedBy,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};

    if (status) filter['status'] = status;
    if (category) filter['category'] = category;
    if (wardId) filter['location.wardId'] = wardId;
    if (reportedBy) filter['reportedBy'] = reportedBy;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [issues, total] = await Promise.all([
      Issue.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Issue.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        issues,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ISSUE BY ID ──────────────────────────────────────────────────────────

export const getIssueById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid issue ID format' });
      return;
    }

    const issue = await Issue.findById(id).lean();

    if (!issue) {
      res.status(404).json({ success: false, error: 'Issue not found' });
      return;
    }

    res.json({ success: true, data: issue });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export const updateIssueStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { id } = req.params;
    const { status, updatedBy } = req.body as { status: IssueStatus; updatedBy: string };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid issue ID format' });
      return;
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      res.status(404).json({ success: false, error: 'Issue not found' });
      return;
    }

    const oldStatus = issue.status;
    issue.status = status;

    // Auto-escalate: if in_progress for a long time without resolution, bump escalation
    if (status === 'escalated' && issue.escalationLevel < 4) {
      issue.escalationLevel = (Math.min(issue.escalationLevel + 1, 4)) as 0 | 1 | 2 | 3 | 4;
    }

    await issue.save();

    // Fire-and-forget notification
    triggerStatusChangeNotification({
      issueId: String(issue._id),
      recipientId: issue.reportedBy,
      oldStatus,
      newStatus: status,
      wardId: issue.location.wardId,
      category: issue.category,
      rawDescription: issue.rawDescription,
      updatedBy: updatedBy || 'system',
    });

    res.json({
      success: true,
      data: {
        id: issue._id,
        status: issue.status,
        escalationLevel: issue.escalationLevel,
        updatedAt: issue.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── TRIGGER DNA ANALYSIS ─────────────────────────────────────────────────────

export const analyzeIssue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid issue ID format' });
      return;
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      res.status(404).json({ success: false, error: 'Issue not found' });
      return;
    }

    // Run DNA analysis
    const dna = await analyzeIssueDNA({
      description: issue.rawDescription,
      category: issue.category,
      location: {
        address: issue.location.address,
        wardId: issue.location.wardId,
        wardName: issue.location.wardName,
      },
    });

    // Update issue with DNA and auto-update category if DNA identified one
    issue.dna = dna;
    if (
      dna.classification &&
      issue.category === 'other' &&
      dna.department?.zoneId
    ) {
      // Map department zone to category
      const zoneToCategory: Record<string, IssueCategory> = {
        'ZONE-ROADS': 'roads',
        'ZONE-ELEC': 'streetlights',
        'ZONE-SWM': 'garbage',
        'ZONE-WATER': 'water',
        'ZONE-DRAIN': 'drainage',
        'ZONE-GEN': 'other',
      };
      const mappedCategory = zoneToCategory[dna.department.zoneId];
      if (mappedCategory) {
        issue.category = mappedCategory;
      }
    }

    if (issue.status === 'pending') {
      issue.status = 'validated';
    }

    await issue.save();

    // Fire-and-forget assignment trigger
    triggerAssignment(issue);

    res.json({
      success: true,
      data: {
        id: issue._id,
        dna: issue.dna,
        category: issue.category,
        status: issue.status,
        updatedAt: issue.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── VALIDATE ISSUE ───────────────────────────────────────────────────────────

export const validateIssue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { id } = req.params;
    const {
      citizenId,
      response: validationResponse,
    } = req.body as { citizenId: string; response: ValidationResponse };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid issue ID format' });
      return;
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      res.status(404).json({ success: false, error: 'Issue not found' });
      return;
    }

    // Prevent self-validation
    if (issue.reportedBy === citizenId) {
      res.status(400).json({
        success: false,
        error: 'Issue reporter cannot validate their own issue',
      });
      return;
    }

    // Process validation response
    switch (validationResponse) {
      case 'confirmed_bad':
        issue.validationCount += 1;
        break;
      case 'confirmed_minor':
        issue.validationCount += 1;
        break;
      case 'worse':
        issue.validationCount += 2;
        // Bump escalation if severity "worse"
        if (issue.escalationLevel < 4) {
          issue.escalationLevel = (Math.min(issue.escalationLevel + 1, 4)) as 0 | 1 | 2 | 3 | 4;
        }
        break;
      case 'denied':
        // Negative validation — don't decrement, just track
        break;
    }

    // Auto-escalate if validation threshold exceeded
    if (issue.validationCount >= 10 && issue.status === 'pending') {
      issue.status = 'validated';
    }
    if (issue.validationCount >= 20 && issue.escalationLevel === 0) {
      issue.escalationLevel = 1;
      issue.status = 'escalated';
    }

    await issue.save();

    res.json({
      success: true,
      data: {
        id: issue._id,
        validationCount: issue.validationCount,
        escalationLevel: issue.escalationLevel,
        status: issue.status,
        citizenId,
        response: validationResponse,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── WARD STATS ───────────────────────────────────────────────────────────────

export const getWardStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { wardId } = req.params;

    if (!wardId) {
      res.status(400).json({ success: false, error: 'wardId is required' });
      return;
    }

    const [statusStats, categoryStats, totalCount, avgSeverity] = await Promise.all([
      // Issues grouped by status
      Issue.aggregate([
        { $match: { 'location.wardId': wardId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),

      // Issues grouped by category
      Issue.aggregate([
        { $match: { 'location.wardId': wardId } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $project: { category: '$_id', count: 1, _id: 0 } },
      ]),

      // Total issues in ward
      Issue.countDocuments({ 'location.wardId': wardId }),

      // Average severity (only issues with DNA)
      Issue.aggregate([
        { $match: { 'location.wardId': wardId, 'dna.severityScore': { $exists: true } } },
        { $group: { _id: null, avgSeverity: { $avg: '$dna.severityScore' } } },
      ]),
    ]);

    // Recent issues (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCount = await Issue.countDocuments({
      'location.wardId': wardId,
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Unresolved high-severity issues
    const criticalCount = await Issue.countDocuments({
      'location.wardId': wardId,
      'dna.severityScore': { $gte: 7 },
      status: { $nin: ['resolved'] },
    });

    res.json({
      success: true,
      data: {
        wardId,
        totalIssues: totalCount,
        recentIssues30Days: recentCount,
        criticalUnresolvedIssues: criticalCount,
        averageSeverityScore: avgSeverity[0]?.avgSeverity
          ? parseFloat(avgSeverity[0].avgSeverity.toFixed(2))
          : null,
        byStatus: statusStats,
        byCategory: categoryStats,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

export const healthCheck = (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    service: 'issue-service',
    timestamp: new Date(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
};
