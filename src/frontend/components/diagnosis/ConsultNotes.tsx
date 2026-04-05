import { useMemo } from "react";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { renderMarkdown } from "../../api/report-parser";

interface ConsultNotesProps {
  rawReport: string;
}

export function ConsultNotes({ rawReport }: ConsultNotesProps) {
  const html = useMemo(() => renderMarkdown(rawReport), [rawReport]);

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary dark:text-blue-400" />
        Full Report
      </h3>
      <div
        className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-6 text-sm text-slate-700 dark:text-slate-300 max-h-[40rem] overflow-y-auto prose prose-sm prose-slate dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-h2:text-base prose-h3:text-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-p:my-1.5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
