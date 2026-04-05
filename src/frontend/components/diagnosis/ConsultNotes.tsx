import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import type { DiagnosisReport } from "../../api/types";

interface ConsultNotesProps {
  report: DiagnosisReport;
}

export function ConsultNotes({ report }: ConsultNotesProps) {
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary dark:text-blue-400" />
        Full Report
      </h3>
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-6 text-sm text-slate-700 dark:text-slate-300 max-h-[40rem] overflow-y-auto whitespace-pre-wrap font-mono">
        {JSON.stringify(report, null, 2)}
      </div>
    </div>
  );
}
