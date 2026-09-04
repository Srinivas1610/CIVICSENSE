// ─── Department Routing Service ───────────────────────────────────────────────
// Maps issue categories to the appropriate civic department

export interface IDepartmentInfo {
  departmentName: string;
  contactEmail: string;
  category: string;
}

/**
 * Category-to-department routing table.
 * Supports exact matches and case-insensitive lookups.
 */
const DEPARTMENT_MAP: Record<string, Omit<IDepartmentInfo, 'category'>> = {
  roads: {
    departmentName: 'Roads & Infrastructure Dept',
    contactEmail: 'roads@civicconnect.gov',
  },
  roads_infrastructure: {
    departmentName: 'Roads & Infrastructure Dept',
    contactEmail: 'roads@civicconnect.gov',
  },
  garbage: {
    departmentName: 'Solid Waste Management Dept',
    contactEmail: 'swm@civicconnect.gov',
  },
  solid_waste: {
    departmentName: 'Solid Waste Management Dept',
    contactEmail: 'swm@civicconnect.gov',
  },
  streetlights: {
    departmentName: 'Street Lighting Authority',
    contactEmail: 'lighting@civicconnect.gov',
  },
  electrical_lighting: {
    departmentName: 'Street Lighting Authority',
    contactEmail: 'lighting@civicconnect.gov',
  },
  water: {
    departmentName: 'Water Supply Board',
    contactEmail: 'water@civicconnect.gov',
  },
  drainage: {
    departmentName: 'Drainage & Sewerage Board',
    contactEmail: 'drainage@civicconnect.gov',
  },
  water_drainage: {
    departmentName: 'Drainage & Sewerage Board',
    contactEmail: 'drainage@civicconnect.gov',
  },
  public_safety: {
    departmentName: 'Disaster Response & Public Safety Unit',
    contactEmail: 'safety@civicconnect.gov',
  },
  other: {
    departmentName: 'Municipal Operations & Maintenance Unit',
    contactEmail: 'municipal@civicconnect.gov',
  },
};

const DEFAULT_DEPARTMENT: Omit<IDepartmentInfo, 'category'> = {
  departmentName: 'Municipal Corporation',
  contactEmail: 'municipal@civicconnect.gov',
};

/**
 * Returns department routing info for a given issue category.
 * Falls back to Municipal Corporation for unknown categories.
 *
 * @param category - The issue category string (e.g. "roads", "water")
 * @returns IDepartmentInfo with departmentName, contactEmail, and category
 */
export function getDepartmentForCategory(category: string): IDepartmentInfo {
  const normalized = (category || '').toLowerCase().trim();
  const dept = DEPARTMENT_MAP[normalized] ?? DEFAULT_DEPARTMENT;

  return {
    category: normalized,
    departmentName: dept.departmentName,
    contactEmail: dept.contactEmail,
  };
}

/**
 * Returns the full list of all supported categories and their departments.
 */
export function getAllDepartments(): IDepartmentInfo[] {
  return Object.entries(DEPARTMENT_MAP).map(([cat, info]) => ({
    category: cat,
    departmentName: info.departmentName,
    contactEmail: info.contactEmail,
  }));
}

/**
 * Checks whether a given category is explicitly mapped (not a default fallback).
 */
export function isMappedCategory(category: string): boolean {
  const normalized = (category || '').toLowerCase().trim();
  return normalized in DEPARTMENT_MAP;
}
