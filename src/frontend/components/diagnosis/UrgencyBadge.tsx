interface UrgencyBadgeProps {
  urgency: "emergent" | "urgent" | "routine" | null;
}

export function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  if (!urgency) return null;

  const styles = {
    emergent:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800",
    urgent:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
    routine:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
  };

  const labels = {
    emergent: "Emergent",
    urgent: "Urgent",
    routine: "Routine",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[urgency]}`}
    >
      {labels[urgency]}
    </span>
  );
}
