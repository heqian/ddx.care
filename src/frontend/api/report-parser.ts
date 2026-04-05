import { marked } from "marked";
import type { ParsedReport, ParsedDiagnosis } from "./types";

/**
 * Parse the Markdown diagnosis report from the CMO agent.
 *
 * Expected format (from CMO prompt):
 *
 *   ### Ranked Differential Diagnosis
 *   **1. Diagnosis Name** — Confidence: X% | Urgency: [Emergent/Urgent/Routine]
 *   - **Rationale:** ...
 *   - **Supporting Evidence:** ...
 *   - **Contradictory Evidence:** ...
 *   - **Suggested Next Steps:** ...
 */
export function parseReport(report: string): ParsedReport {
  return {
    diagnoses: extractDiagnoses(report),
    consultNotes: extractConsultNotes(report),
    rawReport: report,
  };
}

function extractDiagnoses(report: string): ParsedDiagnosis[] {
  const rankedSection = extractSection(report, "Ranked Differential Diagnosis");
  if (!rankedSection) {
    return [
      {
        rank: 1,
        name: "Differential Diagnosis Report",
        confidence: null,
        urgency: null,
        supportingEvidence: [],
        contradictoryEvidence: [],
        nextSteps: [],
        rationale: report,
      },
    ];
  }

  const diagnoses: ParsedDiagnosis[] = [];

  // Match: **1. Diagnosis Name** — Confidence: 99% | Urgency: **EMERGENT (Life-Threatening)**
  // Urgency may be bare, bold, or have parenthetical suffix
  const headerRegex =
    /\*\*(\d+)\.\s+(.+?)\*\*\s*[—–-]\s*Confidence:\s*(\d+)%\s*\|\s*Urgency:\s*\*{0,2}\s*(Emergent|Urgent|Routine)\s*[^*]*\*{0,2}/gi;

  const headers: { rank: number; name: string; confidence: number; urgency: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(rankedSection)) !== null) {
    headers.push({
      rank: parseInt(m[1], 10),
      name: m[2].trim(),
      confidence: parseInt(m[3], 10),
      urgency: m[4],
      index: m.index,
      end: m.index + m[0].length,
    });
  }

  // Fallback: plain numbered format without bold
  if (headers.length === 0) {
    return parseFallback(rankedSection);
  }

  for (let i = 0; i < headers.length; i++) {
    const bodyStart = headers[i].end;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : rankedSection.length;
    const body = rankedSection.slice(bodyStart, bodyEnd);

    const parsed = parseDiagnosisBody(body);

    diagnoses.push({
      rank: headers[i].rank,
      name: headers[i].name,
      confidence: headers[i].confidence,
      urgency: parseUrgency(headers[i].urgency),
      ...parsed,
    });
  }

  return diagnoses;
}

/** Parse the bullet lines under a diagnosis header */
function parseDiagnosisBody(body: string): {
  rationale: string;
  supportingEvidence: string[];
  contradictoryEvidence: string[];
  nextSteps: string[];
} {
  const rationale: string[] = [];
  const supportingEvidence: string[] = [];
  const contradictoryEvidence: string[] = [];
  const nextSteps: string[] = [];

  let currentCategory: "rationale" | "supporting" | "contradictory" | "nextSteps" | null = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Match labeled bullet: - **Label:** content  OR  - Label: content
    const labelMatch = line.match(
      /^[-*]\s+\*{0,2}(Rationale|Supporting Evidence|Contradictory Evidence|Suggested Next Steps)\*{0,2}:\s*(.*)/i,
    );

    if (labelMatch) {
      const label = labelMatch[1].toLowerCase();
      const content = cleanMarkdown(labelMatch[2]);

      switch (label) {
        case "rationale":
          currentCategory = "rationale";
          if (content) rationale.push(content);
          break;
        case "supporting evidence":
          currentCategory = "supporting";
          if (content) supportingEvidence.push(content);
          break;
        case "contradictory evidence":
          currentCategory = "contradictory";
          if (content) contradictoryEvidence.push(content);
          break;
        case "suggested next steps":
          currentCategory = "nextSteps";
          if (content) nextSteps.push(content);
          break;
      }
      continue;
    }

    // Sub-bullet or continuation: - some text
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch && currentCategory) {
      const text = cleanMarkdown(bulletMatch[1]);
      switch (currentCategory) {
        case "rationale":
          rationale.push(text);
          break;
        case "supporting":
          supportingEvidence.push(text);
          break;
        case "contradictory":
          contradictoryEvidence.push(text);
          break;
        case "nextSteps":
          nextSteps.push(text);
          break;
      }
    }
  }

  return {
    rationale: rationale.join(" "),
    supportingEvidence,
    contradictoryEvidence,
    nextSteps,
  };
}

/** Fallback parser for plain numbered format */
function parseFallback(section: string): ParsedDiagnosis[] {
  const diagnoses: ParsedDiagnosis[] = [];
  let current: ParsedDiagnosis | null = null;
  let currentCategory: "rationale" | "supporting" | "contradictory" | "nextSteps" | null = null;

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      if (current) diagnoses.push(current);
      current = {
        rank: parseInt(numberedMatch[1], 10),
        name: cleanMarkdown(numberedMatch[2]),
        confidence: null,
        urgency: null,
        supportingEvidence: [],
        contradictoryEvidence: [],
        nextSteps: [],
        rationale: "",
      };
      currentCategory = null;
      continue;
    }

    if (!current) continue;

    const labelMatch = line.match(
      /^[-*]\s+\*{0,2}(Rationale|Supporting Evidence|Contradictory Evidence|Suggested Next Steps)\*{0,2}:\s*(.*)/i,
    );
    if (labelMatch) {
      const label = labelMatch[1].toLowerCase();
      const content = cleanMarkdown(labelMatch[2]);
      currentCategory =
        label === "rationale" ? "rationale" :
        label === "supporting evidence" ? "supporting" :
        label === "contradictory evidence" ? "contradictory" :
        "nextSteps";
      if (content) appendToCategory(current, currentCategory, content);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch && currentCategory) {
      appendToCategory(current, currentCategory, cleanMarkdown(bulletMatch[1]));
    }
  }

  if (current) diagnoses.push(current);
  return diagnoses;
}

function appendToCategory(
  d: ParsedDiagnosis,
  cat: "rationale" | "supporting" | "contradictory" | "nextSteps",
  text: string,
) {
  switch (cat) {
    case "rationale":
      d.rationale += (d.rationale ? " " : "") + text;
      break;
    case "supporting":
      d.supportingEvidence.push(text);
      break;
    case "contradictory":
      d.contradictoryEvidence.push(text);
      break;
    case "nextSteps":
      d.nextSteps.push(text);
      break;
  }
}

function cleanMarkdown(text: string): string {
  return text.replace(/\*{1,2}/g, "").trim();
}

function parseUrgency(text: string): "emergent" | "urgent" | "routine" {
  const lower = text.toLowerCase();
  if (/emergent|life.?threaten|critical|immediate/.test(lower)) return "emergent";
  if (/urgent|acute/.test(lower)) return "urgent";
  return "routine";
}

/** Extract text between ### headers */
function extractSection(report: string, heading: string): string | null {
  const regex = new RegExp(
    `^###\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=^###\\s|\\Z)`,
    "m",
  );
  const match = report.match(regex);
  return match ? match[1].trim() : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract Specialist Consultations + Cross-Specialty Observations */
function extractConsultNotes(report: string): string {
  const sections: string[] = [];

  const specialistSection = extractSection(report, "Specialist Consultations");
  if (specialistSection) {
    sections.push("### Specialist Consultations\n" + specialistSection);
  }

  const crossSection = extractSection(report, "Cross-Specialty Observations");
  if (crossSection) {
    sections.push("### Cross-Specialty Observations\n" + crossSection);
  }

  return sections.join("\n\n");
}

/** Render raw Markdown to HTML string */
export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}
