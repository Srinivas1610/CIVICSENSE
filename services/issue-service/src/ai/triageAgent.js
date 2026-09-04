const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY || '';
let ai = null;
if (apiKey.trim()) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('[triageAgent] Failed to initialize GoogleGenAI client:', err.message);
  }
}

const IncidentDNASchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A concise 5-8 word public sector incident title' },
    category: {
      type: Type.STRING,
      enum: ['ROADS_INFRASTRUCTURE', 'SOLID_WASTE', 'ELECTRICAL_LIGHTING', 'WATER_DRAINAGE', 'PUBLIC_SAFETY', 'OTHER'],
    },
    severity: { type: Type.INTEGER, description: 'Severity score from 1 (minor cosmetic) to 10 (critical immediate road/life hazard)' },
    hazardDetails: { type: Type.STRING, description: 'Technical description of what is physically broken or hazardous' },
    recommendedDepartment: { type: Type.STRING, description: 'Responsible municipal division (e.g., PWD Road Works, Sanitation Ward, Electricity Board)' },
    estimatedResolutionDays: { type: Type.INTEGER, description: 'Realistic target days to fix this issue based on municipal standards' },
    urgencyReason: { type: Type.STRING, description: 'Why this severity was assigned' },
    isGenuineCivicIssue: { type: Type.BOOLEAN, description: 'True if this is a real civic hazard; False if spam, selfie, or unrelated' },
  },
  required: [
    'title',
    'category',
    'severity',
    'hazardDetails',
    'recommendedDepartment',
    'estimatedResolutionDays',
    'urgencyReason',
    'isGenuineCivicIssue',
  ],
};

/**
 * Deterministic heuristic fallback when offline, in tests, or without GEMINI_API_KEY.
 */
function heuristicFallback({ textPrompt, imageBase64 }) {
  const text = (textPrompt || '').toLowerCase().trim();

  // Spam / Non-civic check
  const isSpam =
    text.includes('selfie') ||
    text.includes('meme') ||
    text.includes('joke') ||
    text.includes('cute dog') ||
    text.includes('my cat') ||
    text.includes('spam') ||
    text.includes('dinner') ||
    text.includes('lunch') ||
    text.includes('party') ||
    ((text === 'hi' || text === 'hello' || text === 'hey') && !imageBase64);

  if (isSpam) {
    return {
      title: 'Non-Civic or Irrelevant Submission',
      category: 'OTHER',
      severity: 1,
      hazardDetails: 'Submission does not depict or describe a municipal public infrastructure hazard or defect.',
      recommendedDepartment: 'Municipal Public Relations',
      estimatedResolutionDays: 1,
      urgencyReason: 'Filtered by automated civic spam detection.',
      isGenuineCivicIssue: false,
    };
  }

  // Drainage & Water
  if (
    text.includes('drain') ||
    text.includes('culvert') ||
    text.includes('sewer') ||
    text.includes('flood') ||
    text.includes('leak') ||
    text.includes('pipeline') ||
    text.includes('waterlog') ||
    text.includes('stagnant')
  ) {
    return {
      title: 'Choked Storm Drainage Overflow and Waterlogging',
      category: 'WATER_DRAINAGE',
      severity: 7,
      hazardDetails:
        textPrompt ||
        'Stormwater culvert obstructed by silt and debris causing stagnant backflow across public right-of-way.',
      recommendedDepartment: 'Stormwater Drainage & Flood Control Wing',
      estimatedResolutionDays: 2,
      urgencyReason: 'Road sub-base erosion, pedestrian blockage, and vector-borne health risks.',
      isGenuineCivicIssue: true,
    };
  }

  // Roads & Infrastructure
  if (
    text.includes('pothole') ||
    text.includes('crater') ||
    text.includes('road') ||
    text.includes('asphalt') ||
    text.includes('tarmac') ||
    text.includes('pavement') ||
    text.includes('sidewalk') ||
    text.includes('footpath') ||
    text.includes('divider')
  ) {
    return {
      title: 'Dangerous Road Surface Crater and Asphalt Failure',
      category: 'ROADS_INFRASTRUCTURE',
      severity: 8,
      hazardDetails:
        textPrompt ||
        'Deep vehicular asphalt crater with fractured bitumen boundaries creating extreme skid risk.',
      recommendedDepartment: 'PWD Road Works & Highway Infrastructure',
      estimatedResolutionDays: 2,
      urgencyReason: 'Immediate hazard to two-wheeler riders, vehicle tire blowouts, and severe traffic congestion.',
      isGenuineCivicIssue: true,
    };
  }

  // Solid Waste
  if (
    text.includes('garbage') ||
    text.includes('waste') ||
    text.includes('trash') ||
    text.includes('dump') ||
    text.includes('bin') ||
    text.includes('debris') ||
    text.includes('stench') ||
    text.includes('rotting')
  ) {
    return {
      title: 'Overflowing Municipal Waste Receptacle and Sanitation Hazard',
      category: 'SOLID_WASTE',
      severity: 6,
      hazardDetails:
        textPrompt ||
        'Uncollected municipal garbage overflowing onto the street with decaying solid waste.',
      recommendedDepartment: 'Sanitation Ward & Solid Waste Management',
      estimatedResolutionDays: 1,
      urgencyReason: 'Biochemical public health hazard, foul odor, and rodent/pest proliferation.',
      isGenuineCivicIssue: true,
    };
  }

  // Electrical & Streetlights
  if (
    text.includes('light') ||
    text.includes('lamp') ||
    text.includes('dark') ||
    text.includes('electric') ||
    text.includes('wire') ||
    text.includes('pole') ||
    text.includes('transformer') ||
    text.includes('cable')
  ) {
    return {
      title: 'Non-Functional Public Street Lighting and Electrical Fault',
      category: 'ELECTRICAL_LIGHTING',
      severity: 7,
      hazardDetails:
        textPrompt ||
        'Defective streetlight luminaire and exposed junction box causing prolonged nocturnal darkness.',
      recommendedDepartment: 'Electricity Board & Public Lighting Division',
      estimatedResolutionDays: 2,
      urgencyReason: 'Public nocturnal safety vulnerability, elevated criminal risk, and electrocution hazard.',
      isGenuineCivicIssue: true,
    };
  }

  // Public Safety
  if (
    text.includes('danger') ||
    text.includes('accident') ||
    text.includes('collapse') ||
    text.includes('tree') ||
    text.includes('fire') ||
    text.includes('hazard')
  ) {
    return {
      title: 'Imminent Public Safety Infrastructure Failure',
      category: 'PUBLIC_SAFETY',
      severity: 9,
      hazardDetails:
        textPrompt ||
        'Critical municipal structural damage presenting direct physical danger to commuters and pedestrians.',
      recommendedDepartment: 'Disaster Response & Public Safety Unit',
      estimatedResolutionDays: 1,
      urgencyReason: 'Direct and immediate threat to citizen life and structural safety.',
      isGenuineCivicIssue: true,
    };
  }

  // Default civic issue
  return {
    title: 'Reported Municipal Public Infrastructure Defect',
    category: 'OTHER',
    severity: 5,
    hazardDetails:
      textPrompt ||
      'Citizen submitted civic infrastructure defect requiring municipal inspection.',
    recommendedDepartment: 'Municipal Operations & Maintenance Unit',
    estimatedResolutionDays: 3,
    urgencyReason: 'Standard civic grievance requiring on-site municipal verification.',
    isGenuineCivicIssue: true,
  };
}

async function analyzeCivicIncident({ textPrompt, imageBase64, mimeType }) {
  // Check if API key is configured
  const currentKey = process.env.GEMINI_API_KEY || '';
  if (!currentKey.trim()) {
    console.log('[triageAgent] GEMINI_API_KEY not configured — running deterministic heuristic triage engine');
    return heuristicFallback({ textPrompt, imageBase64 });
  }

  try {
    if (!ai) {
      ai = new GoogleGenAI({ apiKey: currentKey });
    }

    const parts = [];

    if (imageBase64) {
      parts.push({
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || 'image/jpeg',
        },
      });
    }

    const promptText = `
You are the Autonomous Municipal Civic Triage AI for CivicConnect.
Analyze this citizen report submitted via WhatsApp.
Inspect any attached images for structural defects (potholes, open drains, cable faults, garbage overflow).
Extract the root problem, classify it, score its severity accurately, and reject spam.

Citizen note: "${textPrompt || 'Image attached'}"
`;

    parts.push({ text: promptText });

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: IncidentDNASchema,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text.trim());
    return parsed;
  } catch (err) {
    console.warn(`[triageAgent] Gemini API generation error (${err.message}) — using heuristic fallback`);
    return heuristicFallback({ textPrompt, imageBase64 });
  }
}

module.exports = {
  IncidentDNASchema,
  analyzeCivicIncident,
  heuristicFallback,
};
