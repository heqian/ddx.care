interface ConfidenceBadgeProps {
  confidence: number | null;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === null) return null;

  let color: "green" | "yellow" | "red";
  if (confidence >= 70) color = "green";
  else if (confidence >= 40) color = "yellow";
  else color = "red";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        color === "green"
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : color === "yellow"
            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {confidence}% confidence
    </span>
  );
}
