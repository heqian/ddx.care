import { useState, useCallback, useRef } from "react";
import {
  ChatBubbleLeftRightIcon,
  UserIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { UrgencyBadge } from "./UrgencyBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import type { DiagnosisReport, Diagnosis } from "../../api/types";

interface ConsultNotesProps {
  report: DiagnosisReport;
}

function CollapsibleDiagnosis({ diagnosis }: { diagnosis: Diagnosis }) {
  const [open, setOpen] = useState(diagnosis.rank === 1);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="text-slate-400 dark:text-slate-500 shrink-0">
          {open ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
            {diagnosis.rank}
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {diagnosis.name}
          </span>
          <UrgencyBadge urgency={diagnosis.urgency} />
          <ConfidenceBadge confidence={diagnosis.confidence} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0 border-t dark:border-slate-700 space-y-4 ml-7">
          <div className="pt-3">
            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Rationale
            </h5>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {diagnosis.rationale}
            </p>
          </div>

          {diagnosis.supportingEvidence.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Supporting Evidence
              </h5>
              <ul className="space-y-1.5">
                {diagnosis.supportingEvidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diagnosis.contradictoryEvidence.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Contradictory Evidence
              </h5>
              <ul className="space-y-1.5">
                {diagnosis.contradictoryEvidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-300">
                    <XCircleIcon className="h-4 w-4 text-orange-500 dark:text-orange-400 mt-0.5 shrink-0" />
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diagnosis.nextSteps.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Next Steps
              </h5>
              <ul className="space-y-1.5">
                {diagnosis.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <ArrowRightIcon className="h-4 w-4 text-primary dark:text-cyan-400 mt-0.5 shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConsultNotes({ report }: ConsultNotesProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  const exportPdf = useCallback(() => {
    if (!reportRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const isDark = document.documentElement.classList.contains("dark");
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Diagnosis Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1e293b; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
  h3 { font-size: 14px; margin-top: 16px; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #94a3b8; margin-bottom: 24px; }
  .section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .badge-emergent { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge-urgent { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .badge-routine { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
  .badge-confidence { background: #eff6ff; color: #1d4ed8; }
  .callout { padding: 12px 16px; border-radius: 8px; margin-top: 8px; }
  .callout-blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a5f; }
  .callout-red { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
  .specialist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .specialist-card { padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; }
  .specialist-card strong { display: block; margin-bottom: 2px; }
  .diagnosis { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; page-break-inside: avoid; }
  .diagnosis h3 { margin-top: 0; }
  .disclaimer { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
  ul { padding-left: 20px; } li { margin-bottom: 2px; }
  @media print { body { padding: 0; } }
</style></head><body>`);
    printWindow.document.write(reportRef.current.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.print();
  }, []);

  const hasUrgentAction = report.recommendedImmediateActions &&
    report.diagnoses.some((d) => d.urgency === "emergent");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary dark:text-cyan-400" />
          Full Report
        </h3>
        <button
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowDownTrayIcon className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      <div
        ref={reportRef}
        className="bg-white dark:bg-slate-800 rounded-lg p-6 text-sm text-slate-700 dark:text-slate-300 border dark:border-slate-700 shadow-sm max-h-[50rem] overflow-y-auto space-y-6"
      >
        {/* Chief Complaint & Patient Summary */}
        <div className="space-y-4">
          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <UserIcon className="h-4 w-4 text-primary" />
              Chief Complaint
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed">
              {report.chiefComplaint}
            </p>
          </div>

          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <DocumentTextIcon className="h-4 w-4 text-primary" />
              Patient Summary
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed">
              {report.patientSummary}
            </p>
          </div>
        </div>

        {/* Specialists Consulted */}
        {report.specialistsConsulted && report.specialistsConsulted.length > 0 && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-4">
              <UserGroupIcon className="h-4 w-4 text-purple-500" />
              Specialists Consulted
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                ({report.specialistsConsulted.length})
              </span>
            </h4>
            <div className="pl-6 grid gap-3 sm:grid-cols-2">
              {report.specialistsConsulted.map((sc, idx) => (
                <div
                  key={idx}
                  className="bg-purple-50 dark:bg-purple-900/10 p-3 rounded-lg border border-purple-100 dark:border-purple-800/30"
                >
                  <span className="font-medium text-purple-900 dark:text-purple-300 block mb-1">
                    {sc.specialist}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed block whitespace-pre-wrap">
                    {sc.keyFindings}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diagnoses - Collapsible */}
        {report.diagnoses && report.diagnoses.length > 0 && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-4">
              <ClipboardDocumentListIcon className="h-4 w-4 text-indigo-500" />
              Ranked Differential Diagnoses
            </h4>
            <div className="space-y-2">
              {report.diagnoses.map((diag) => (
                <CollapsibleDiagnosis key={diag.rank} diagnosis={diag} />
              ))}
            </div>
          </div>
        )}

        {/* Cross-Specialty Observations - Callout */}
        {report.crossSpecialtyObservations && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <ChartBarIcon className="h-4 w-4 text-teal-500" />
              Cross-Specialty Observations
            </h4>
            <div className="callout-blue ml-0 pl-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 rounded-lg border border-blue-200 dark:border-blue-800/50 text-sm leading-relaxed whitespace-pre-wrap">
                {report.crossSpecialtyObservations}
              </div>
            </div>
          </div>
        )}

        {/* Recommended Immediate Actions - Urgency callout */}
        {report.recommendedImmediateActions && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <ExclamationTriangleIcon className={`h-4 w-4 ${hasUrgentAction ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
              Recommended Immediate Actions
              {hasUrgentAction && (
                <span className="badge badge-emergent ml-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                  URGENT
                </span>
              )}
            </h4>
            <div className="pl-6">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 rounded-lg border border-red-300 dark:border-red-800/60 text-sm font-semibold leading-relaxed whitespace-pre-wrap">
                {report.recommendedImmediateActions}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
