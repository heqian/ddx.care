import { useState, useCallback, useRef, useMemo } from "react";
import {
  ArrowPathIcon,
  DocumentChartBarIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { DiagnosisCard } from "../components/diagnosis/DiagnosisCard";
import { ConsultNotes } from "../components/diagnosis/ConsultNotes";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import type { AvailableReportOutcome, StatusResponse } from "../api/types";

interface ResultsViewProps {
  result: StatusResponse;
  onNewCase: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}

type Tab = "diagnoses" | "consult";

const TABS: { key: Tab; label: string }[] = [
  { key: "diagnoses", label: "Diagnoses" },
  { key: "consult", label: "Full Report" },
];

export function ResultsView({
  result,
  onNewCase,
  onRetry,
  retrying = false,
}: ResultsViewProps) {
  const outcome = result.result;

  if (!outcome) {
    return (
      <div className="text-center space-y-4">
        <p className="text-lg text-danger">No report data available.</p>
        <Button onClick={onNewCase}>Start New Case</Button>
      </div>
    );
  }

  if (outcome.status === "generation_failed") {
    return (
      <section
        className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/70 dark:bg-slate-900"
        aria-labelledby="report-unavailable-title"
      >
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-7 dark:border-amber-900/70 dark:bg-amber-950/30 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="rounded-full border border-amber-300 bg-white p-3 text-amber-700 shadow-sm dark:border-amber-800 dark:bg-slate-900 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                No medical conclusions generated
              </p>
              <h1
                id="report-unavailable-title"
                className="font-display text-2xl text-slate-950 dark:text-white sm:text-3xl"
              >
                Diagnostic Report Unavailable
              </h1>
              <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                {outcome.message}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-7 sm:px-8">
          <div className="border-l-2 border-danger pl-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Seek professional evaluation
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {outcome.safetyGuidance}
            </p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reference code: {outcome.errorCode}
          </p>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-800 sm:flex-row">
            {outcome.retryable && onRetry && (
              <Button onClick={onRetry} disabled={retrying}>
                <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                {retrying ? "Retrying..." : "Try Again"}
              </Button>
            )}
            <Button variant="secondary" onClick={onNewCase}>
              Start New Case
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return <AvailableResultsView outcome={outcome} onNewCase={onNewCase} />;
}

interface AvailableResultsViewProps {
  outcome: AvailableReportOutcome;
  onNewCase: () => void;
}

function AvailableResultsView({
  outcome,
  onNewCase,
}: AvailableResultsViewProps) {
  const [tab, setTab] = useState<Tab>("diagnoses");
  const tabListRef = useRef<HTMLDivElement>(null);

  const report = outcome.report;
  const generatedAt = outcome.generatedAt;

  const renderMarkdown = useCallback(
    (text: string) =>
      DOMPurify.sanitize(marked.parse(text, { async: false }) as string),
    [],
  );

  const crossSpecialtyHtml = useMemo(
    () =>
      report?.crossSpecialtyObservations
        ? renderMarkdown(report.crossSpecialtyObservations)
        : null,
    [report?.crossSpecialtyObservations, renderMarkdown],
  );

  const immediateActionsHtml = useMemo(
    () =>
      report?.recommendedImmediateActions
        ? renderMarkdown(report.recommendedImmediateActions)
        : null,
    [report?.recommendedImmediateActions, renderMarkdown],
  );

  const selectTab = useCallback((key: Tab) => {
    setTab(key);
    const btn = tabListRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${key}"]`,
    );
    btn?.focus();
  }, []);

  const handlePrint = useCallback(() => {
    if (!report) return;
    if (
      navigator.share &&
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ) {
      const text = [
        report.chiefComplaint && `Chief Complaint: ${report.chiefComplaint}`,
        report.patientSummary && `\nPatient Summary:\n${report.patientSummary}`,
        report.diagnoses.length > 0 &&
          `\nDifferential Diagnoses:\n${report.diagnoses.map((d) => `${d.rank}. ${d.name} (${d.confidence}% confidence, ${d.urgency})`).join("\n")}`,
        report.recommendedImmediateActions &&
          `\nImmediate Actions:\n${report.recommendedImmediateActions}`,
      ]
        .filter(Boolean)
        .join("\n");
      navigator
        .share({ title: "Differential Diagnosis Report", text })
        .catch(() => {});
      return;
    }
    window.print();
  }, [report]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % TABS.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = TABS.length - 1;
      }
      if (nextIndex !== null) {
        e.preventDefault();
        selectTab(TABS[nextIndex].key);
      }
    },
    [selectTab],
  );

  const topDiagnoses = report.diagnoses.slice(0, 3);
  const otherDiagnoses = report.diagnoses.slice(3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display">Differential Diagnosis</h1>
          {generatedAt && (
            <p className="text-xs text-slate-400 mt-1">
              Generated {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={handlePrint}>
            <PrinterIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button variant="secondary" onClick={onNewCase}>
            <ArrowPathIcon className="h-4 w-4" />
            New Case
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div
        ref={tabListRef}
        role="tablist"
        data-print-hide
        className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none relative"
        style={{
          maskImage: "linear-gradient(to right, black 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, black 90%, transparent 100%)",
        }}
      >
        <button
          id="tab-diagnoses"
          role="tab"
          data-tab="diagnoses"
          aria-selected={tab === "diagnoses"}
          aria-controls="panel-diagnoses"
          tabIndex={tab === "diagnoses" ? 0 : -1}
          onClick={() => selectTab("diagnoses")}
          onKeyDown={(e) => handleTabKeyDown(e, 0)}
          className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            tab === "diagnoses"
              ? "border-primary text-primary dark:text-primary dark:border-primary"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <DocumentChartBarIcon
            className="h-4 w-4 inline mr-1.5 -mt-0.5"
            aria-hidden="true"
          />
          Diagnoses ({report.diagnoses.length})
        </button>
        <button
          id="tab-consult"
          role="tab"
          data-tab="consult"
          aria-selected={tab === "consult"}
          aria-controls="panel-consult"
          tabIndex={tab === "consult" ? 0 : -1}
          onClick={() => selectTab("consult")}
          onKeyDown={(e) => handleTabKeyDown(e, 1)}
          className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            tab === "consult"
              ? "border-primary text-primary dark:text-primary dark:border-primary"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Full Report
        </button>
      </div>

      {/* Tab Content */}
      <div
        id="panel-diagnoses"
        role="tabpanel"
        aria-labelledby="tab-diagnoses"
        hidden={tab !== "diagnoses"}
      >
        <div className="space-y-4">
          {report.chiefComplaint && (
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2 uppercase">
                Chief Complaint
              </h3>
              <p className="text-slate-800 dark:text-slate-200">
                {report.chiefComplaint}
              </p>
            </div>
          )}

          {/* Top Diagnoses */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Top Differential Diagnoses
            </h2>
            <div className="space-y-3">
              {topDiagnoses.map((d) => (
                <DiagnosisCard key={d.rank} diagnosis={d} />
              ))}
            </div>
          </div>

          {/* Other Diagnoses */}
          {otherDiagnoses.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Other Considerations
              </h2>
              <div className="space-y-3">
                {otherDiagnoses.map((d) => (
                  <DiagnosisCard key={d.rank} diagnosis={d} />
                ))}
              </div>
            </div>
          )}

          {/* Cross-Specialty Observations */}
          {crossSpecialtyHtml && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Cross-Specialty Observations
              </h2>
              <div
                className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 rounded-lg border border-blue-200 dark:border-blue-800/50 text-sm"
                dangerouslySetInnerHTML={{ __html: crossSpecialtyHtml }}
              />
            </div>
          )}

          {/* Immediate Actions */}
          {immediateActionsHtml && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Recommended Immediate Actions
              </h2>
              <div
                className="p-4 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 rounded-lg border border-red-200 dark:border-red-800/50 text-sm font-semibold"
                dangerouslySetInnerHTML={{ __html: immediateActionsHtml }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        id="panel-consult"
        role="tabpanel"
        aria-labelledby="tab-consult"
        hidden={tab !== "consult"}
      >
        <ConsultNotes report={report} />
      </div>

      {/* Disclaimer */}
      <div
        data-print-hide
        className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1"
      >
        <p className="font-semibold text-red-600 dark:text-red-400">
          ⚠️ RESEARCH USE ONLY — NOT FOR CLINICAL USE — NOT HIPAA COMPLIANT
        </p>
        <p className="font-medium">
          This report is generated by a proof-of-concept AI demo for research
          purposes ONLY. It is not a medical device, has NO regulatory approval,
          and is NOT HIPAA compliant. All outputs are AI-generated suggestions
          with NO GUARANTEE OF ACCURACY.
        </p>
        <p>
          This report must NOT be used for medical diagnosis, treatment
          decisions, or patient care. Never rely on it for any medical decision
          — always consult a qualified healthcare professional.
        </p>
        <p className="font-semibold text-red-600 dark:text-red-400">
          LEGAL DISCLAIMER: By using this tool, you acknowledge this is a
          research demo. You accept ALL RISK and release the operators from ANY
          AND ALL LIABILITY for any outcomes arising from use of or reliance on
          these outputs. This tool is not intended to diagnose, treat, cure, or
          prevent any disease.
        </p>
      </div>
    </div>
  );
}
