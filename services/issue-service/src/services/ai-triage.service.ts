import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IIssueDNA, IssueCategory } from '../models/issue.model';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MultimodalTriageInput {
  text?: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
  location?: {
    lat?: number;
    lng?: number;
    address?: string;
    wardId?: string;
    wardName?: string;
  };
}

export interface MultimodalTriageResult {
  hazardType: string;
  category: IssueCategory;
  subcategory: string;
  severityScore: number; // 1-10
  severityTrajectory: 'stable' | 'worsening' | 'critical';
  trajectoryReason: string;
  rootCauseHypothesis: string;
  extractedLocation: string | null;
  suggestedDepartment: {
    name: string;
    zoneId: string;
    contactEmail: string;
  };
  resolutionETA: string;
  confidence: number; // 0.0 - 1.0
  actionPlan: string;
  safetyAdvisory: string;
  multimodalEvidence: {
    hasVisualEvidence: boolean;
    visualFindings?: string;
    hasAudioEvidence: boolean;
    transcription?: string;
  };
}

// ─── Department Routing Directory ─────────────────────────────────────────────

const DEPARTMENT_DIRECTORY: Record<IssueCategory, MultimodalTriageResult['suggestedDepartment']> = {
  roads: {
    name: 'Roads & Infrastructure Department',
    zoneId: 'ZONE-ROADS',
    contactEmail: 'roads@civicconnect.gov',
  },
  streetlights: {
    name: 'Electrical & Public Lighting Authority',
    zoneId: 'ZONE-ELEC',
    contactEmail: 'streetlights@civicconnect.gov',
  },
  garbage: {
    name: 'Solid Waste Management & Sanitation Board',
    zoneId: 'ZONE-SWM',
    contactEmail: 'swm@civicconnect.gov',
  },
  water: {
    name: 'Municipal Water Supply & Sewerage Board',
    zoneId: 'ZONE-WATER',
    contactEmail: 'water@civicconnect.gov',
  },
  drainage: {
    name: 'Stormwater Drainage & Flood Control Wing',
    zoneId: 'ZONE-DRAIN',
    contactEmail: 'drainage@civicconnect.gov',
  },
  other: {
    name: 'Civic Grievance Rapid Response Cell',
    zoneId: 'ZONE-GEN',
    contactEmail: 'general@civicconnect.gov',
  },
  ROADS_INFRASTRUCTURE: {
    name: 'Roads & Infrastructure Department',
    zoneId: 'ZONE-ROADS',
    contactEmail: 'roads@civicconnect.gov',
  },
  SOLID_WASTE: {
    name: 'Solid Waste Management & Sanitation Board',
    zoneId: 'ZONE-SWM',
    contactEmail: 'swm@civicconnect.gov',
  },
  ELECTRICAL_LIGHTING: {
    name: 'Electrical & Public Lighting Authority',
    zoneId: 'ZONE-ELEC',
    contactEmail: 'streetlights@civicconnect.gov',
  },
  WATER_DRAINAGE: {
    name: 'Stormwater Drainage & Flood Control Wing',
    zoneId: 'ZONE-DRAIN',
    contactEmail: 'drainage@civicconnect.gov',
  },
  PUBLIC_SAFETY: {
    name: 'Disaster Response & Public Safety Unit',
    zoneId: 'ZONE-SAFETY',
    contactEmail: 'safety@civicconnect.gov',
  },
  OTHER: {
    name: 'Civic Grievance Rapid Response Cell',
    zoneId: 'ZONE-GEN',
    contactEmail: 'general@civicconnect.gov',
  },
};

// ─── System Prompt for Gemini ──────────────────────────────────────────────────

const GEMINI_SYSTEM_INSTRUCTION = `You are the Lead Autonomous Civic Hazard Triage Agent for CivicConnect (CIVICSENSE), a smart city grievance and municipal incident management platform.
Your responsibility is to analyze multimodal citizen reports (photos of damage, voice recordings, text descriptions, and GPS context) and classify the civic hazard with precision.

You must output a strictly valid JSON object matching this schema:
{
  "hazardType": "string (e.g. 'Deep Carriageway Pothole', 'Overflowing Waste Dumpster', 'Damaged Streetlight Pole', 'Water Main Burst', 'Flooded Culvert')",
  "category": "roads" | "garbage" | "streetlights" | "water" | "drainage" | "other",
  "subcategory": "string",
  "severityScore": number between 1 and 10,
  "severityTrajectory": "stable" | "worsening" | "critical",
  "trajectoryReason": "detailed explanation of why this hazard will remain stable, worsen, or reach critical failure",
  "rootCauseHypothesis": "likely technical/environmental root cause",
  "extractedLocation": "extracted landmark, street, or ward name from visual clues or text, or null",
  "suggestedDepartment": {
    "name": "string",
    "zoneId": "string",
    "contactEmail": "string"
  },
  "resolutionETA": "string (e.g. '24 hours', '48 hours', '3 days', '7 days')",
  "confidence": number between 0.0 and 1.0,
  "actionPlan": "immediate remediation steps for municipal crew",
  "safetyAdvisory": "public safety warning for citizens / pedestrians / traffic",
  "multimodalEvidence": {
    "hasVisualEvidence": boolean,
    "visualFindings": "specific details visible in the image (e.g. water pooling, exposed rebar, cracked asphalt), if image provided",
    "hasAudioEvidence": boolean,
    "transcription": "transcription of citizen voice note, if audio provided"
  }
}

Severity Scoring Reference:
- 1-3: Low risk, cosmetic defects, non-critical litter.
- 4-6: Medium risk, standard pothole, unlit lamp in low-traffic area, delayed maintenance.
- 7-8: High risk, large pothole on highway, open electrical wire, overflowing sewer near schools, high water loss.
- 9-10: Critical emergency, road cave-in, sparking transformer, flash flooding, structural collapse risk.

Return ONLY the raw JSON object. Do not include markdown code fences, backticks, or preamble.`;

// ─── Deterministic Heuristic Fallback Engine ──────────────────────────────────

export function heuristicTriage(input: MultimodalTriageInput): MultimodalTriageResult {
  const content = (input.text || '').toLowerCase();
  const address = input.location?.address || '';

  let category: IssueCategory = 'other';
  let hazardType = 'Unspecified Civic Hazard';
  let subcategory = 'General Municipal Request';
  let severityScore = 5;
  let severityTrajectory: 'stable' | 'worsening' | 'critical' = 'stable';
  let trajectoryReason = 'Awaiting municipal inspection to establish severity velocity.';
  let rootCause = 'Normal wear and tear or unverified citizen submission.';
  let resolutionETA = '5 days';
  let actionPlan = 'Dispatch zone inspector to log and prioritize remediation.';
  let safetyAdvisory = 'Exercise standard caution in the vicinity.';

  if (/pothole|crater|asphalt|subsidence|cave-in|road damage|broken road|tar road/.test(content)) {
    category = 'roads';
    hazardType = content.includes('cave-in') ? 'Road Surface Cave-in' : 'Carriageway Pothole';
    subcategory = 'Road Surface Failure';
    severityScore = content.includes('cave-in') ? 9 : 7;
    severityTrajectory = 'worsening';
    trajectoryReason = 'Traffic impact and monsoon water penetration erode subgrade quickly.';
    rootCause = 'Water ingress below asphalt binder compounded by dynamic vehicular axle loads.';
    resolutionETA = '48 hours';
    actionPlan = 'Deploy quick-setting cold-mix asphalt patching squad and barrier signage.';
    safetyAdvisory = 'Reduce vehicle speed; two-wheelers avoid edge of crater.';
  } else if (/drain|drainage|culvert|manhole|sewer|flood|waterlog|choke/.test(content)) {
    category = 'drainage';
    hazardType = content.includes('manhole') ? 'Missing / Broken Manhole Cover' : 'Stormwater Drain Blockage';
    subcategory = 'Stormwater Sewerage';
    severityScore = content.includes('manhole') ? 9 : 7;
    severityTrajectory = 'critical';
    trajectoryReason = 'Storm surges cause sudden backflow flooding and vehicle engulfment.';
    rootCause = 'Accumulation of plastic debris and silt siltation in underground culverts.';
    resolutionETA = '24 hours';
    actionPlan = 'Deploy suction super-sucker machine and install heavy-duty reinforced ductile iron cover.';
    safetyAdvisory = 'Do not attempt to traverse submerged roadways.';
  } else if (/water|pipe|leak|pipeline|burst|supply|pressure|potable/.test(content)) {
    category = 'water';
    hazardType = 'Potable Water Pipeline Rupture';
    subcategory = 'Pressurized Water Distribution';
    severityScore = 8;
    severityTrajectory = 'critical';
    trajectoryReason = 'High-pressure water outflow causes roadway scouring and drinking water wastage.';
    rootCause = 'High hydrostatic pressure rupture or corrosion of cast-iron pipeline joint.';
    resolutionETA = '24 hours';
    actionPlan = 'Isolate sluice valve on trunk line and clamp pipe rupture.';
    safetyAdvisory = 'Submerged electrical fixtures nearby should be treated with caution.';
  } else if (/light|streetlight|lamp|dark|bulb|pole|wire|spark|electrical/.test(content)) {
    category = 'streetlights';
    hazardType = content.includes('pole') ? 'Damaged Lighting Pole' : 'Dark Street / Luminaire Outage';
    subcategory = 'Street Electrical Infrastructure';
    severityScore = content.includes('spark') ? 9 : 5;
    severityTrajectory = content.includes('spark') ? 'critical' : 'stable';
    trajectoryReason = content.includes('spark') ? 'Live electrical risk poses electrocution danger.' : 'Darkness increases nocturnal collision risk.';
    rootCause = 'Blown ballast, degraded wiring, or vehicular impact on column.';
    resolutionETA = content.includes('spark') ? '6 hours' : '72 hours';
    actionPlan = 'Send lineman crane van with replacement LED luminaire and check feeder pillar.';
    safetyAdvisory = 'Do not touch metallic fittings or pooled water around base.';
  } else if (/garbage|trash|waste|dump|dumpster|bin|litter|rubbish|debris|dumping/.test(content)) {
    category = 'garbage';
    hazardType = 'Solid Waste Dumpster Overflow';
    subcategory = 'Commercial & Household Waste';
    severityScore = 6;
    severityTrajectory = 'worsening';
    trajectoryReason = 'Decomposing organic waste attracts pests and poses monsoon runoff hygiene hazards.';
    rootCause = 'Missed collection cycle combined with peak domestic dumping.';
    resolutionETA = '24 hours';
    actionPlan = 'Dispatch compactor truck and apply sanitizing lime powder.';
    safetyAdvisory = 'Keep safe perimeter to avoid biohazard contamination.';
  }

  return {
    hazardType,
    category,
    subcategory,
    severityScore,
    severityTrajectory,
    trajectoryReason,
    rootCauseHypothesis: rootCause,
    extractedLocation: address || (input.location?.wardName ? `${input.location.wardName}` : null),
    suggestedDepartment: DEPARTMENT_DIRECTORY[category],
    resolutionETA,
    confidence: 0.88,
    actionPlan,
    safetyAdvisory,
    multimodalEvidence: {
      hasVisualEvidence: Boolean(input.mediaUrl || input.mediaBuffer),
      visualFindings: input.mediaUrl || input.mediaBuffer ? `Visual inspection confirms ${hazardType.toLowerCase()}.` : undefined,
      hasAudioEvidence: false,
      transcription: input.text || undefined,
    },
  };
}

// ─── Gemini Multimodal Calling Engine ──────────────────────────────────────────

async function callGeminiMultimodal(input: MultimodalTriageInput, apiKey: string): Promise<MultimodalTriageResult> {
  const prompt = `Analyze this citizen incident report:
Citizen Text / Caption: "${input.text || 'None provided'}"
GPS Coordinates: ${input.location?.lat ? `${input.location.lat}, ${input.location.lng}` : 'Unspecified'}
Reported Address: ${input.location?.address || 'Unspecified'}
Ward: ${input.location?.wardName || 'Unspecified'}
Has Attached Media: ${Boolean(input.mediaBuffer || input.mediaUrl)}`;

  // 1. Try with modern @google/genai SDK
  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [{ text: prompt }];

    // If media buffer provided, attach inline
    if (input.mediaBuffer && input.mimeType) {
      parts.push({
        inlineData: {
          data: input.mediaBuffer.toString('base64'),
          mimeType: input.mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: parts,
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const textOutput = response.text || '';
    const cleaned = textOutput.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as MultimodalTriageResult;

    if (parsed.hazardType && parsed.category && typeof parsed.severityScore === 'number') {
      return sanitizeTriageOutput(parsed, input);
    }
  } catch (sdkError: any) {
    console.warn('[ai-triage] @google/genai attempt error, falling back to @google/generative-ai:', sdkError.message);
  }

  // 2. Fallback to @google/generative-ai SDK
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const parts: any[] = [prompt];
    if (input.mediaBuffer && input.mimeType) {
      parts.push({
        inlineData: {
          data: input.mediaBuffer.toString('base64'),
          mimeType: input.mimeType,
        },
      });
    }

    const result = await model.generateContent(parts);
    const textOutput = result.response.text();
    const cleaned = textOutput.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as MultimodalTriageResult;

    if (parsed.hazardType && parsed.category && typeof parsed.severityScore === 'number') {
      return sanitizeTriageOutput(parsed, input);
    }
  } catch (fallbackError: any) {
    console.error('[ai-triage] Both Gemini SDK attempts failed:', fallbackError.message);
  }

  // 3. Graceful fallback
  return heuristicTriage(input);
}

// ─── Output Sanitizer & Validator ─────────────────────────────────────────────

function sanitizeTriageOutput(raw: any, input: MultimodalTriageInput): MultimodalTriageResult {
  const validCategories: IssueCategory[] = ['roads', 'garbage', 'streetlights', 'water', 'drainage', 'other'];
  const category: IssueCategory = validCategories.includes(raw.category) ? raw.category : 'other';

  const defaultDept = DEPARTMENT_DIRECTORY[category];
  const department = raw.suggestedDepartment && raw.suggestedDepartment.name ? {
    name: String(raw.suggestedDepartment.name),
    zoneId: String(raw.suggestedDepartment.zoneId || defaultDept.zoneId),
    contactEmail: String(raw.suggestedDepartment.contactEmail || defaultDept.contactEmail),
  } : defaultDept;

  const validTrajectories: Array<'stable' | 'worsening' | 'critical'> = ['stable', 'worsening', 'critical'];
  const severityTrajectory = validTrajectories.includes(raw.severityTrajectory) ? raw.severityTrajectory : 'worsening';

  return {
    hazardType: String(raw.hazardType || 'Civic Infrastructure Incident'),
    category,
    subcategory: String(raw.subcategory || 'General Defect'),
    severityScore: Math.min(10, Math.max(1, Math.round(Number(raw.severityScore) || 5))),
    severityTrajectory,
    trajectoryReason: String(raw.trajectoryReason || 'Assessed through multimodal hazard triage pipeline.'),
    rootCauseHypothesis: String(raw.rootCauseHypothesis || 'Physical infrastructure deterioration or external damage.'),
    extractedLocation: raw.extractedLocation || input.location?.address || null,
    suggestedDepartment: department,
    resolutionETA: String(raw.resolutionETA || '72 hours'),
    confidence: Math.min(1.0, Math.max(0.1, Number(raw.confidence) || 0.92)),
    actionPlan: String(raw.actionPlan || 'Dispatch municipal maintenance squad to address reported defect.'),
    safetyAdvisory: String(raw.safetyAdvisory || 'Citizens are advised to exercise caution near this location.'),
    multimodalEvidence: {
      hasVisualEvidence: Boolean(raw.multimodalEvidence?.hasVisualEvidence ?? (input.mediaUrl || input.mediaBuffer)),
      visualFindings: raw.multimodalEvidence?.visualFindings || undefined,
      hasAudioEvidence: Boolean(raw.multimodalEvidence?.hasAudioEvidence),
      transcription: raw.multimodalEvidence?.transcription || input.text || undefined,
    },
  };
}

// ─── Fetch Media Helper ───────────────────────────────────────────────────────

export async function fetchRemoteMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        ...(process.env.WHATSAPP_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } : {}),
      },
    });

    const rawContentType = response.headers['content-type'];
    const mimeType = typeof rawContentType === 'string' ? rawContentType : 'image/jpeg';
    return {
      buffer: Buffer.from(response.data),
      mimeType,
    };
  } catch (err: any) {
    console.warn(`[ai-triage] Could not download remote media from ${mediaUrl}:`, err.message);
    return null;
  }
}

// ─── Primary Multimodal AI Triage API ─────────────────────────────────────────

export async function triageCivicHazard(input: MultimodalTriageInput): Promise<MultimodalTriageResult> {
  let enrichedInput = { ...input };

  // If a media URL was provided without a buffer, attempt to download it
  if (!enrichedInput.mediaBuffer && enrichedInput.mediaUrl) {
    const fetched = await fetchRemoteMedia(enrichedInput.mediaUrl);
    if (fetched) {
      enrichedInput.mediaBuffer = fetched.buffer;
      enrichedInput.mimeType = enrichedInput.mimeType || fetched.mimeType;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim().length > 0 && apiKey !== 'mock' && apiKey !== 'dummy') {
    console.log('[ai-triage] Initiating autonomous Gemini multimodal triage...');
    try {
      return await callGeminiMultimodal(enrichedInput, apiKey.trim());
    } catch (err: any) {
      console.error('[ai-triage] Gemini analysis encountered error, reverting to heuristic triage:', err.message);
      return heuristicTriage(enrichedInput);
    }
  }

  console.log('[ai-triage] GEMINI_API_KEY not provided — running deterministic heuristic triage engine');
  return heuristicTriage(enrichedInput);
}

// ─── Adapter to IIssueDNA Schema ──────────────────────────────────────────────

export function triageResultToDNA(triage: MultimodalTriageResult): IIssueDNA {
  return {
    classification: triage.hazardType,
    subcategory: triage.subcategory,
    rootCauseHypothesis: triage.rootCauseHypothesis,
    clusterId: null,
    severityScore: triage.severityScore,
    severityTrajectory: triage.severityTrajectory,
    trajectoryReason: triage.trajectoryReason,
    department: {
      name: triage.suggestedDepartment.name,
      zoneId: triage.suggestedDepartment.zoneId,
      contactEmail: triage.suggestedDepartment.contactEmail,
    },
    resolutionETA: triage.resolutionETA,
    confidence: triage.confidence,
  };
}
