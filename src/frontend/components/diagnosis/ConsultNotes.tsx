import { ChatBubbleLeftRightIcon, UserIcon, UserGroupIcon, DocumentTextIcon, ExclamationTriangleIcon, ClipboardDocumentListIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import type { DiagnosisReport } from "../../api/types";

interface ConsultNotesProps {
  report: DiagnosisReport;
}

export function ConsultNotes({ report }: ConsultNotesProps) {
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary dark:text-blue-400" />
        Full Report
      </h3>
      
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-sm text-slate-700 dark:text-slate-300 border dark:border-slate-700 shadow-sm max-h-[40rem] overflow-y-auto space-y-6">
        
        {/* Chief Complaint & Patient Summary */}
        <div className="space-y-4">
          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <UserIcon className="h-4 w-4 text-blue-500" />
              Chief Complaint
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed">{report.chiefComplaint}</p>
          </div>
          
          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <DocumentTextIcon className="h-4 w-4 text-blue-500" />
              Patient Summary
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed">{report.patientSummary}</p>
          </div>
        </div>

        {/* Specialists Consulted */}
        {report.specialistsConsulted && report.specialistsConsulted.length > 0 && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-4">
              <UserGroupIcon className="h-4 w-4 text-purple-500" />
              Specialists Consulted
            </h4>
            <div className="pl-6 grid gap-4 sm:grid-cols-2">
              {report.specialistsConsulted.map((sc, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded border dark:border-slate-600">
                  <span className="font-medium text-slate-800 dark:text-slate-200 block mb-1">{sc.specialist}</span>
                  <span className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed block whitespace-pre-wrap">{sc.keyFindings}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diagnoses */}
        {report.diagnoses && report.diagnoses.length > 0 && (
          <div className="pt-4 border-t dark:border-slate-700">
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-4">
              <ClipboardDocumentListIcon className="h-4 w-4 text-indigo-500" />
              Diagnoses
            </h4>
            <div className="space-y-4 pl-6">
              {report.diagnoses.map((diag, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded border dark:border-slate-600 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div>
                      <span className="font-semibold text-base text-slate-800 dark:text-slate-200">
                        #{diag.rank} {diag.name}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-1 rounded-full ${diag.urgency === 'emergent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : diag.urgency === 'urgent' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {diag.urgency.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {diag.confidence}% CONFIDENCE
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Rationale</span>
                    <p className="mt-1 leading-relaxed">{diag.rationale}</p>
                  </div>
                  
                  {diag.supportingEvidence && diag.supportingEvidence.length > 0 && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Supporting Evidence</span>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {diag.supportingEvidence.map((ev, i) => <li key={i}>{ev}</li>)}
                      </ul>
                    </div>
                  )}
                  
                  {diag.contradictoryEvidence && diag.contradictoryEvidence.length > 0 && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Contradictory Evidence</span>
                      <ul className="list-disc list-inside mt-1 text-orange-600 dark:text-orange-400 space-y-1">
                        {diag.contradictoryEvidence.map((ev, i) => <li key={i}>{ev}</li>)}
                      </ul>
                    </div>
                  )}

                  {diag.nextSteps && diag.nextSteps.length > 0 && (
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Next Steps</span>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {diag.nextSteps.map((step, i) => <li key={i}>{step}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observations & Actions */}
        <div className="pt-4 border-t dark:border-slate-700 space-y-4">
          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <ChartBarIcon className="h-4 w-4 text-teal-500" />
              Cross Specialty Observations
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed">{report.crossSpecialtyObservations || "None"}</p>
          </div>

          <div>
            <h4 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-2">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
              Recommended Immediate Actions
            </h4>
            <p className="pl-6 whitespace-pre-wrap leading-relaxed font-medium text-slate-800 dark:text-slate-200">{report.recommendedImmediateActions || "None"}</p>
          </div>
        </div>
        
      </div>
    </div>
  );
}
