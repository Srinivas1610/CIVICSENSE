import axios from 'axios';
import { IIssueDNA } from '../models/issue.model';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DNAAnalysisInput {
  description: string;
  category?: string;
  location?: { address: string; wardId: string; wardName: string };
}

// ─── Department Map ───────────────────────────────────────────────────────────

const DEPARTMENT_MAP: Record<string, IIssueDNA['department']> = {
  roads: {
    name: 'Roads & Infrastructure Department',
    zoneId: 'ZONE-ROADS',
    contactEmail: 'roads@civicconnect.gov',
  },
  streetlights: {
    name: 'Electrical & Street Lighting Department',
    zoneId: 'ZONE-ELEC',
    contactEmail: 'streetlights@civicconnect.gov',
  },
  garbage: {
    name: 'Solid Waste Management Department',
    zoneId: 'ZONE-SWM',
    contactEmail: 'swm@civicconnect.gov',
  },
  water: {
    name: 'Water Supply & Sanitation Department',
    zoneId: 'ZONE-WATER',
    contactEmail: 'water@civicconnect.gov',
  },
  drainage: {
    name: 'Storm Drain & Drainage Department',
    zoneId: 'ZONE-DRAIN',
    contactEmail: 'drainage@civicconnect.gov',
  },
  other: {
    name: 'General Municipal Services',
    zoneId: 'ZONE-GEN',
    contactEmail: 'general@civicconnect.gov',
  },
};

// ─── Keyword Classifier ───────────────────────────────────────────────────────

interface ClassificationResult {
  classification: string;
  subcategory: string;
  category: string;
  severityScore: number;
  severityTrajectory: 'stable' | 'worsening' | 'critical';
  trajectoryReason: string;
  rootCauseHypothesis: string;
  resolutionETA: string;
}

function classifyByKeywords(description: string): ClassificationResult {
  const lower = description.toLowerCase();

  // Roads / potholes
  if (/pothole|crater|road crack|road damage|broken road|damaged road|asphalt/.test(lower)) {
    return {
      classification: 'Pothole',
      subcategory: 'Road Surface Damage',
      category: 'roads',
      severityScore: 6,
      severityTrajectory: 'worsening',
      trajectoryReason: 'Potholes expand with traffic and rainfall; likely to worsen without intervention.',
      rootCauseHypothesis: 'Subgrade erosion due to water seepage under the road surface combined with heavy vehicle load.',
      resolutionETA: '7 days',
    };
  }

  // General road issues
  if (/road|street|highway|pavement|footpath|sidewalk|junction/.test(lower)) {
    return {
      classification: 'Road Infrastructure Issue',
      subcategory: 'General Road Defect',
      category: 'roads',
      severityScore: 5,
      severityTrajectory: 'stable',
      trajectoryReason: 'Condition is currently stable but requires monitoring.',
      rootCauseHypothesis: 'Aging road infrastructure due to normal wear and delayed maintenance.',
      resolutionETA: '14 days',
    };
  }

  // Streetlights
  if (/streetlight|street light|lamp post|light pole|dark street|no light|light out|broken light/.test(lower)) {
    return {
      classification: 'Broken Streetlight',
      subcategory: 'Electrical Failure',
      category: 'streetlights',
      severityScore: 5,
      severityTrajectory: 'stable',
      trajectoryReason: 'Non-functional lights pose safety hazard but do not typically worsen over time.',
      rootCauseHypothesis: 'Blown fuse, damaged wiring, or bulb failure due to age or electrical surge.',
      resolutionETA: '3 days',
    };
  }

  // Garbage / waste
  if (/garbage|waste|trash|rubbish|dump|litter|overflowing bin|smell|stench|rotting/.test(lower)) {
    return {
      classification: 'Illegal Garbage Dump',
      subcategory: 'Solid Waste Accumulation',
      category: 'garbage',
      severityScore: 7,
      severityTrajectory: 'worsening',
      trajectoryReason: 'Accumulated garbage attracts pests and creates health hazards; worsens rapidly.',
      rootCauseHypothesis: 'Missed collection schedule or unauthorized dumping by residents.',
      resolutionETA: '1 day',
    };
  }

  // Water / drainage
  if (/water|flood|drain|waterlog|pipe burst|leakage|sewage|overflow/.test(lower)) {
    return {
      classification: 'Water or Drainage Issue',
      subcategory: 'Water Infrastructure',
      category: 'water',
      severityScore: 7,
      severityTrajectory: 'critical',
      trajectoryReason: 'Water-related issues can escalate quickly causing structural and health hazards.',
      rootCauseHypothesis: 'Blocked or broken drainage infrastructure or pipe burst.',
      resolutionETA: '2 days',
    };
  }

  // Default fallback
  return {
    classification: 'General Infrastructure Issue',
    subcategory: 'Unclassified Municipal Problem',
    category: 'other',
    severityScore: 4,
    severityTrajectory: 'stable',
    trajectoryReason: 'No clear escalation pattern detected from description.',
    rootCauseHypothesis: 'Insufficient description for root cause analysis. Manual inspection recommended.',
    resolutionETA: '10 days',
  };
}

// ─── Mock DNA Builder ─────────────────────────────────────────────────────────

function buildMockDNA(input: DNAAnalysisInput): IIssueDNA {
  const result = classifyByKeywords(input.description);
  const department = DEPARTMENT_MAP[result.category] || DEPARTMENT_MAP['other'];

  return {
    classification: result.classification,
    subcategory: result.subcategory,
    rootCauseHypothesis: result.rootCauseHypothesis,
    clusterId: null,
    severityScore: result.severityScore,
    severityTrajectory: result.severityTrajectory,
    trajectoryReason: result.trajectoryReason,
    department,
    resolutionETA: result.resolutionETA,
    confidence: 0.72,
  };
}

// ─── NVIDIA API Integration ───────────────────────────────────────────────────

async function analyzeWithNvidia(input: DNAAnalysisInput): Promise<IIssueDNA> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  const baseURL = 'https://integrate.api.nvidia.com/v1';
  const model = 'google/gemma-3-27b-it';

  const systemPrompt = `You are a civic issue analysis engine for a smart city platform called CivicConnect.
Analyze the reported civic issue and return ONLY valid JSON matching this exact schema:
{
  "classification": "string (e.g. Pothole, Broken Streetlight, Illegal Garbage Dump)",
  "subcategory": "string",
  "rootCauseHypothesis": "string",
  "clusterId": null,
  "severityScore": number (1-10),
  "severityTrajectory": "stable" | "worsening" | "critical",
  "trajectoryReason": "string",
  "department": {
    "name": "string",
    "zoneId": "string",
    "contactEmail": "string"
  },
  "resolutionETA": "string (e.g. '3 days', '1 week')",
  "confidence": number (0.0-1.0)
}
Return ONLY the JSON object. No markdown, no explanation.`;

  const userPrompt = `Analyze this civic issue report:
Description: ${input.description}
${input.category ? `Category hint: ${input.category}` : ''}
${input.location ? `Location: ${input.location.address}, ${input.location.wardName}` : ''}`;

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const rawContent: string = response.data.choices?.[0]?.message?.content || '';
  
  // Extract JSON from response (handle possible markdown code blocks)
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('NVIDIA API returned invalid JSON response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as IIssueDNA;

  // Validate required fields, fall back to mock if invalid
  if (!parsed.classification || typeof parsed.severityScore !== 'number') {
    console.warn('[dna.service] NVIDIA response missing required fields, using mock');
    return buildMockDNA(input);
  }

  return parsed;
}

// ─── Main DNA Analysis Function ───────────────────────────────────────────────

export async function analyzeIssueDNA(input: DNAAnalysisInput): Promise<IIssueDNA> {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      console.log('[dna.service] Using NVIDIA API for DNA analysis');
      return await analyzeWithNvidia(input);
    } catch (err) {
      const error = err as Error;
      console.error('[dna.service] NVIDIA API failed, falling back to mock:', error.message);
      return buildMockDNA(input);
    }
  }

  console.log('[dna.service] NVIDIA_API_KEY not set, using deterministic mock');
  return buildMockDNA(input);
}

export { classifyByKeywords, buildMockDNA };
