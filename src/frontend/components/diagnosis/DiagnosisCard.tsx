import { Card } from "../ui/Card";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { UrgencyBadge } from "./UrgencyBadge";
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import type { Diagnosis } from "../../api/types";

interface DiagnosisCardProps {
  diagnosis: Diagnosis;
}

const rankBadgeColors: Record<number, string> = {
  1: "bg-primary text-white dark:bg-cyan-500",
  2: "bg-slate-500 text-white dark:bg-slate-400",
  3: "bg-slate-400 text-white dark:bg-slate-500",
};

export function DiagnosisCard({ diagnosis }: DiagnosisCardProps) {
  const rankColor =
    rankBadgeColors[diagnosis.rank] || "bg-slate-300 text-slate-700";

  const rationaleHtml = useMemo(
    () =>
      diagnosis.rationale
        ? DOMPurify.sanitize(marked.parse(diagnosis.rationale) as string)
        : "",
    [diagnosis.rationale],
  );

  return (
    <Card
      className={`${
        diagnosis.rank === 1
          ? "ring-2 ring-primary/30 dark:ring-blue-500/30"
          : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold shrink-0 ${rankColor}`}
        >
          {diagnosis.rank}
        </span>
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{diagnosis.name}</h3>
            <ConfidenceBadge confidence={diagnosis.confidence} />
            <UrgencyBadge urgency={diagnosis.urgency} />
          </div>

          {/* Rationale */}
          {diagnosis.rationale && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Rationale
              </h4>
              {rationaleHtml ? (
                <div
                  className="text-sm text-slate-600 dark:text-slate-300 prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5"
                  dangerouslySetInnerHTML={{ __html: rationaleHtml }}
                />
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {diagnosis.rationale}
                </p>
              )}
            </div>
          )}

          {/* Supporting Evidence */}
          {diagnosis.supportingEvidence.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Supporting Evidence
              </h4>
              <ul className="space-y-1">
                {diagnosis.supportingEvidence.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="text-green-500 dark:text-green-400 mt-0.5">
                      +
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contradictory Evidence */}
          {diagnosis.contradictoryEvidence.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Contradictory Evidence
              </h4>
              <ul className="space-y-1">
                {diagnosis.contradictoryEvidence.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="text-red-500 dark:text-red-400 mt-0.5">
                      -
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Next Steps */}
          {diagnosis.nextSteps.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Suggested Next Steps
              </h4>
              <ul className="space-y-1">
                {diagnosis.nextSteps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="text-primary dark:text-cyan-400">
                      {"→"}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
