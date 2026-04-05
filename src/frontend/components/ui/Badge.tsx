interface BadgeProps {
  children: React.ReactNode;
  color?: "green" | "yellow" | "red" | "gray" | "blue";
  className?: string;
}

const colorClasses = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export function Badge({ children, color = "gray", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[color]} ${className}`}
    >
      {children}
    </span>
  );
}
