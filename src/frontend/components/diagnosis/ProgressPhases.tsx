import {
  CheckIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import type { ProgressEvent } from "../../api/types";

export type DiagnosticPhase =
  | "triaging"
  | "consulting"
  | "synthesizing"
  | "reporting";

export interface PhaseState {
  phase: DiagnosticPhase;
  completedCount: number;
  totalCount: number;
}

const PHASES: { key: DiagnosticPhase; label: string }[] = [
  { key: "triaging", label: "Triaging Case" },
  { key: "consulting", label: "Consulting Specialists" },
  { key: "synthesizing", label: "Synthesizing Findings" },
  { key: "reporting", label: "Generating Report" },
];

export function derivePhase(
  progress: ProgressEvent[] | undefined,
  isCompleted: boolean,
): PhaseState {
  if (isCompleted) {
    return { phase: "reporting", completedCount: 0, totalCount: 0 };
  }

  if (!progress || progress.length === 0) {
    return { phase: "triaging", completedCount: 0, totalCount: 0 };
  }

  let started = 0;
  let completed = 0;
  let hasCmoFinal = false;

  for (const p of progress) {
    if (p.eventType === "specialist_start") started++;
    if (p.eventType === "specialist_complete") completed++;
    if (p.eventType === "cmo_final") hasCmoFinal = true;
  }

  if (hasCmoFinal) {
    return {
      phase: "reporting",
      completedCount: completed,
      totalCount: started,
    };
  }

  if (started === 0) {
    return { phase: "triaging", completedCount: 0, totalCount: 0 };
  }

  if (started === completed) {
    return {
      phase: "synthesizing",
      completedCount: completed,
      totalCount: started,
    };
  }

  return {
    phase: "consulting",
    completedCount: completed,
    totalCount: started,
  };
}

interface ProgressPhasesProps {
  progress: ProgressEvent[] | undefined;
  isCompleted: boolean;
}

export function ProgressPhases({ progress, isCompleted }: ProgressPhasesProps) {
  const state = derivePhase(progress, isCompleted);
  const currentIdx = PHASES.findIndex((p) => p.key === state.phase);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2">
        {PHASES.map((p, i) => {
          const isCurrent = i === currentIdx;
          const isPast = isCompleted || i < currentIdx;

          let label = p.label;
          if (p.key === "consulting" && isCurrent && state.totalCount > 0) {
            label = `${state.completedCount}/${state.totalCount} consulted`;
          }

          return (
            <div key={p.key} className="flex items-center gap-2 shrink-0">
              <span
                className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                  isPast
                    ? "bg-green-500 text-white"
                    : isCurrent
                      ? "bg-primary text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
                }`}
              >
                {isPast ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : isCurrent && p.key === "reporting" ? (
                  <DocumentTextIcon className="h-3.5 w-3.5" />
                ) : isCurrent &&
                  (p.key === "consulting" || p.key === "triaging") ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isPast
                    ? "text-green-600 dark:text-green-400"
                    : isCurrent
                      ? "text-primary"
                      : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
