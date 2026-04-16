import { useState } from "react";
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
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                  >
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
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-300"
                  >
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
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                  >
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
  const hasUrgentAction =
    report.recommendedImmediateActions &&
    report.diagnoses.some((d) => d.urgency === "emergent");

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary dark:text-cyan-400" />
        Full Report
      </h3>

      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-sm text-slate-700 dark:text-slate-300 border dark:border-slate-700 shadow-sm max-h-[50rem] overflow-y-auto space-y-6">
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
        {report.specialistsConsulted &&
          report.specialistsConsulted.length > 0 && (
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
              <ExclamationTriangleIcon
                className={`h-4 w-4 ${hasUrgentAction ? "text-red-500 animate-pulse" : "text-amber-500"}`}
              />
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

        {/* Disclaimer in report */}
        <div className="pt-4 border-t dark:border-slate-700 disclaimer">
          <p className="text-xs text-red-500 dark:text-red-400 font-semibold mb-1">
            RESEARCH USE ONLY — NOT FOR CLINICAL USE — NOT A MEDICAL DEVICE —
            NOT HIPAA COMPLIANT
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
            This report was generated by a proof-of-concept AI research demo. It
            has no regulatory approval (FDA or otherwise), has not been
            validated for clinical accuracy, and is NOT HIPAA compliant. AI
            outputs may be inaccurate, incomplete, or fabricated.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            This report must NOT be used for medical diagnosis, treatment
            decisions, or patient care. Never rely on it for any medical
            decision — always consult a qualified licensed healthcare
            professional. No doctor-patient relationship is created by the use
            of this tool.
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 font-semibold mt-2">
            LEGAL DISCLAIMER: This tool is provided "AS IS" without warranty of
            any kind. You accept ALL RISK and release the operators, developers,
            and affiliates from ANY AND ALL LIABILITY — direct, indirect,
            incidental, or consequential — arising from use of or reliance on
            these outputs. Not intended to diagnose, treat, cure, or prevent any
            disease.
          </p>
        </div>
      </div>
    </div>
  );
}
