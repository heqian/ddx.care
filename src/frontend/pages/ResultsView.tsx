import { useState } from "react";
import { ArrowPathIcon, DocumentChartBarIcon } from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { DiagnosisCard } from "../components/diagnosis/DiagnosisCard";
import { ConsultNotes } from "../components/diagnosis/ConsultNotes";
import type { StatusResponse } from "../api/types";

interface ResultsViewProps {
  result: StatusResponse;
  onNewCase: () => void;
}

type Tab = "diagnoses" | "consult";

export function ResultsView({ result, onNewCase }: ResultsViewProps) {
  const [tab, setTab] = useState<Tab>("diagnoses");

  const report = result.result?.result?.report;
  const generatedAt = result.result?.result?.generatedAt;
  const disclaimer = result.result?.result?.disclaimer;

  if (!report) {
    return (
      <div className="text-center space-y-4">
        <p className="text-lg text-danger">No report data available.</p>
        <Button onClick={onNewCase}>Start New Case</Button>
      </div>
    );
  }

  const topDiagnoses = report.diagnoses.slice(0, 3);
  const otherDiagnoses = report.diagnoses.slice(3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display">Differential Diagnosis</h1>
          {generatedAt && (
            <p className="text-xs text-slate-400 mt-1">
              Generated {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onNewCase}>
          <ArrowPathIcon className="h-4 w-4" />
          New Case
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setTab("diagnoses")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "diagnoses"
              ? "border-primary text-primary dark:text-cyan-400 dark:border-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <DocumentChartBarIcon className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Diagnoses ({report.diagnoses.length})
        </button>
        <button
          onClick={() => setTab("consult")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "consult"
              ? "border-primary text-primary dark:text-cyan-400 dark:border-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Full Report
        </button>
      </div>

      {/* Tab Content */}
      {tab === "diagnoses" && (
        <div className="space-y-4">

          {report.chiefComplaint && (
             <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
               <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2 uppercase">Chief Complaint</h3>
               <p className="text-slate-800 dark:text-slate-200">{report.chiefComplaint}</p>
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
          {report.crossSpecialtyObservations && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Cross-Specialty Observations
              </h2>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 rounded-lg border border-blue-200 dark:border-blue-800/50 text-sm">
                 {report.crossSpecialtyObservations}
              </div>
            </div>
          )}

          {/* Immediate Actions */}
          {report.recommendedImmediateActions && (
             <div className="mt-4">
               <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                 Recommended Immediate Actions
               </h2>
               <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 rounded-lg border border-red-200 dark:border-red-800/50 text-sm font-semibold">
                  {report.recommendedImmediateActions}
               </div>
             </div>
          )}
        </div>
      )}

      {tab === "consult" && (
        <ConsultNotes report={report} />
      )}

      {/* Disclaimer */}
      {disclaimer && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-xs text-slate-500 dark:text-slate-400">
          {disclaimer}
        </div>
      )}
    </div>
  );
}
