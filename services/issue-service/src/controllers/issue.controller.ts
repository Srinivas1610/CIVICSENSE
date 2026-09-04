import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Issue, { IssueStatus, IssueCategory, ValidationResponse } from '../models/issue.model';
import { analyzeIssueDNA } from '../services/dna.service';
import { triggerAssignment } from '../services/assignment-trigger.service';
import { triggerStatusChangeNotification } from '../services/notification-trigger.service';
import {
  triageCivicHazard,
  triageResultToDNA,
  MultimodalTriageInput,
  MultimodalTriageResult,
} from '../services/ai-triage.service';

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

// ─── WHATSAPP WEBHOOK (META CLOUD API) ────────────────────────────────────────

export const whatsappWebhookVerify = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'civicconnect_token';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[issue-service] WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Forbidden' });
};

export const whatsappWebhookReceive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body;
    let senderPhone = '+919845012345';
    let description = '';
    let mediaUrl: string | undefined;
    let mediaBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let locLat = 13.3525;
    let locLng = 74.7928;
    let locAddress = 'Reported via WhatsApp - Location Pending Confirmation';
    let locWardId = 'WARD-01';
    let locWardName = 'Manipal Central Ward';
    let isMessage = false;

    // Check Meta WhatsApp Cloud API envelope
    if (body.object === 'whatsapp_business_account' || body.entry) {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        isMessage = true;
        senderPhone = message.from || senderPhone;

        if (message.type === 'text') {
          description = message.text?.body || 'Civic issue reported via WhatsApp';
        } else if (message.type === 'image') {
          description = message.image?.caption || 'Photo civic hazard reported via WhatsApp';
          mimeType = message.image?.mime_type || 'image/jpeg';
          if (message.image?.id) {
            mediaUrl = `https://graph.facebook.com/v19.0/${message.image.id}`;
          }
        } else if (message.type === 'audio') {
          description = 'Voice note civic hazard reported via WhatsApp';
          mimeType = message.audio?.mime_type || 'audio/ogg';
          if (message.audio?.id) {
            mediaUrl = `https://graph.facebook.com/v19.0/${message.audio.id}`;
          }
        } else if (message.type === 'location' && message.location) {
          description = 'Live location pin reported via WhatsApp';
          locLat = message.location.latitude;
          locLng = message.location.longitude;
          locAddress = message.location.address || message.location.name || locAddress;
        } else {
          description = `Reported via WhatsApp (${message.type} message)`;
        }
      }
    } else if (body.from || body.text || body.message || body.imageUrl || body.mediaUrl || body.imageBase64) {
      // Direct / Simulator payload support
      isMessage = true;
      senderPhone = body.from || body.sender || senderPhone;
      description = body.text || body.caption || body.message || 'Civic hazard reported via WhatsApp';
      mediaUrl = body.mediaUrl || body.imageUrl || body.audioUrl;
      mimeType = body.mimeType;

      if (body.imageBase64) {
        const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        mediaBuffer = Buffer.from(base64Data, 'base64');
        mimeType = mimeType || 'image/jpeg';
      } else if (body.audioBase64) {
        const base64Data = body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
        mediaBuffer = Buffer.from(base64Data, 'base64');
        mimeType = mimeType || 'audio/ogg';
      }

      if (body.location) {
        locLat = body.location.lat ?? locLat;
        locLng = body.location.lng ?? locLng;
        locAddress = body.location.address ?? locAddress;
        locWardId = body.location.wardId ?? locWardId;
        locWardName = body.location.wardName ?? locWardName;
      }
    }

    if (isMessage) {
      console.log(`[issue-service] 🤖 AI Triage Agent analyzing WhatsApp report from ${senderPhone}: "${description}"`);

      // Execute autonomous Multimodal AI Triage (Gemini)
      const triageResult = await triageCivicHazard({
        text: description,
        mediaUrl,
        mediaBuffer,
        mimeType,
        location: {
          lat: locLat,
          lng: locLng,
          address: locAddress,
          wardId: locWardId,
          wardName: locWardName,
        },
      });

      // Automatically create and log the issue with status 'assigned'
      const rawDesc = description.length >= 10
        ? description
        : `${description} — ${triageResult.hazardType}: ${triageResult.rootCauseHypothesis}`;

      const finalAddress = triageResult.extractedLocation || locAddress;

      const issue = new Issue({
        reportedBy: senderPhone,
        rawDescription: rawDesc,
        channel: 'whatsapp',
        category: triageResult.category,
        location: {
          lat: locLat,
          lng: locLng,
          address: finalAddress,
          wardId: locWardId,
          wardName: locWardName,
          geohash: 'tdm6s1q',
        },
        media: mediaUrl ? [mediaUrl] : [],
        status: 'assigned', // Auto-dispatched directly by AI triage
        validationCount: 0,
        escalationLevel: 0,
        dna: triageResultToDNA(triageResult),
      });

      await issue.save();

      // Autonomous Ticket Dispatch: Notify assignment-service immediately
      await triggerAssignment(issue);

      // Automated Citizen Notification: Confirmation alert
      triggerStatusChangeNotification({
        issueId: String(issue._id),
        recipientId: senderPhone,
        oldStatus: 'pending',
        newStatus: 'assigned',
        wardId: issue.location.wardId,
        category: issue.category,
        rawDescription: issue.rawDescription,
        updatedBy: 'GEMINI_AUTONOMOUS_TRIAGE_AGENT',
      });

      console.log(`[issue-service] ⚡ Auto-dispatched issue #${issue._id} to ${triageResult.suggestedDepartment.name} (Severity: ${triageResult.severityScore}/10, ETA: ${triageResult.resolutionETA})`);

      res.status(200).json({
        success: true,
        autoDispatched: true,
        issueId: issue._id,
        category: issue.category,
        severityScore: triageResult.severityScore,
        department: triageResult.suggestedDepartment.name,
        resolutionETA: triageResult.resolutionETA,
        triage: triageResult,
      });
      return;
    }

    // Acknowledge all other events
    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    next(err);
  }
};

// ─── AUTONOMOUS MULTIMODAL AI TRIAGE REST ENDPOINT ────────────────────────────

export const autonomousTriageIssue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      text,
      mediaUrl,
      imageBase64,
      audioBase64,
      mimeType,
      location,
      autoDispatch = true,
      reportedBy = 'AI_TRIAGE_CITIZEN',
      channel = 'app',
    } = req.body;

    let mediaBuffer: Buffer | undefined;
    let computedMimeType = mimeType;

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      mediaBuffer = Buffer.from(base64Data, 'base64');
      computedMimeType = computedMimeType || 'image/jpeg';
    } else if (audioBase64) {
      const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      mediaBuffer = Buffer.from(base64Data, 'base64');
      computedMimeType = computedMimeType || 'audio/ogg';
    }

    const triageResult = await triageCivicHazard({
      text: text || 'Civic infrastructure defect',
      mediaUrl,
      mediaBuffer,
      mimeType: computedMimeType,
      location,
    });

    if (!autoDispatch) {
      res.status(200).json({
        success: true,
        autoDispatched: false,
        triage: triageResult,
      });
      return;
    }

    const locLat = location?.lat || 13.3525;
    const locLng = location?.lng || 74.7928;
    const locAddress = location?.address || triageResult.extractedLocation || 'Manipal, Karnataka';
    const locWardId = location?.wardId || 'WARD-01';
    const locWardName = location?.wardName || 'Manipal Central Ward';

    const rawDesc = (text && text.length >= 10)
      ? text
      : `${triageResult.hazardType}: ${triageResult.rootCauseHypothesis}`;

    const issue = new Issue({
      reportedBy,
      rawDescription: rawDesc,
      channel: channel || 'app',
      category: triageResult.category,
      location: {
        lat: locLat,
        lng: locLng,
        address: locAddress,
        wardId: locWardId,
        wardName: locWardName,
        geohash: location?.geohash || 'tdm6s1q',
      },
      media: mediaUrl ? [mediaUrl] : [],
      status: 'assigned',
      validationCount: 0,
      escalationLevel: 0,
      dna: triageResultToDNA(triageResult),
    });

    await issue.save();
    await triggerAssignment(issue);

    triggerStatusChangeNotification({
      issueId: String(issue._id),
      recipientId: reportedBy,
      oldStatus: 'pending',
      newStatus: 'assigned',
      wardId: issue.location.wardId,
      category: issue.category,
      rawDescription: issue.rawDescription,
      updatedBy: 'GEMINI_AUTONOMOUS_TRIAGE_AGENT',
    });

    res.status(201).json({
      success: true,
      autoDispatched: true,
      data: {
        issue,
        triage: triageResult,
      },
    });
  } catch (err) {
    next(err);
  }
};

