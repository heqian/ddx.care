export interface PiiDetectionResult {
  hasPII: boolean;
  detectedTypes: string[];
}

const PII_PATTERNS = [
  { type: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: "MRN", regex: /\bmrn[\s#:]*([a-zA-Z0-9-]{5,})\b/i },
  { type: "Phone", regex: /\b(?:\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/ },
  { type: "Email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { type: "DOB", regex: /\b(dob|date of birth)[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i },
  { type: "Name", regex: /\b(name|patient|mr\.|mrs\.|ms\.)[:\s]+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/i },
];

export function detectPII(text: string): PiiDetectionResult {
  const detectedTypes = new Set<string>();
  
  if (!text) {
    return { hasPII: false, detectedTypes: [] };
  }

  for (const { type, regex } of PII_PATTERNS) {
    if (regex.test(text)) {
      detectedTypes.add(type);
    }
  }

  return {
    hasPII: detectedTypes.size > 0,
    detectedTypes: Array.from(detectedTypes),
  };
}
