import { useState } from "react";
import { ArrowPathIcon, DocumentChartBarIcon } from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { DiagnosisCard } from "../components/diagnosis/DiagnosisCard";
import { ConsultNotes } from "../components/diagnosis/ConsultNotes";
import { parseReport } from "../api/report-parser";
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

  const parsed = parseReport(report);
  const topDiagnoses = parsed.diagnoses.slice(0, 3);
  const otherDiagnoses = parsed.diagnoses.slice(3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Differential Diagnosis</h1>
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
              ? "border-primary text-primary dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <DocumentChartBarIcon className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Diagnoses ({parsed.diagnoses.length})
        </button>
        <button
          onClick={() => setTab("consult")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "consult"
              ? "border-primary text-primary dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Consult Notes
        </button>
      </div>

      {/* Tab Content */}
      {tab === "diagnoses" && (
        <div className="space-y-4">
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
        </div>
      )}

      {tab === "consult" && (
        <ConsultNotes rawReport={report} />
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
