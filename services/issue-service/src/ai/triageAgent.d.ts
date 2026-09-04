export interface IIncidentDNA {
  title: string;
  category:
    | 'ROADS_INFRASTRUCTURE'
    | 'SOLID_WASTE'
    | 'ELECTRICAL_LIGHTING'
    | 'WATER_DRAINAGE'
    | 'PUBLIC_SAFETY'
    | 'OTHER';
  severity: number;
  hazardDetails: string;
  recommendedDepartment: string;
  estimatedResolutionDays: number;
  urgencyReason: string;
  isGenuineCivicIssue: boolean;
}

export declare const IncidentDNASchema: any;

export declare function analyzeCivicIncident(params: {
  textPrompt?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<IIncidentDNA>;

export declare function heuristicFallback(params: {
  textPrompt?: string;
  imageBase64?: string;
}): IIncidentDNA;
