import { useState, useRef } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";

interface FileDropZoneProps {
  onFileContent: (content: string) => void;
  accept?: string;
  label: string;
  className?: string;
}

export function FileDropZone({
  onFileContent,
  accept = ".txt,.csv",
  label,
  className = "",
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = `fdz-help-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      onFileContent(reader.result as string);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={helpId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      className={`border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-primary bg-blue-50 dark:bg-blue-900/20"
          : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <DocumentArrowUpIcon
        className="mx-auto h-8 w-8 text-slate-400 mb-2"
        aria-hidden="true"
      />
      {fileName ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">{fileName}</p>
      ) : (
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
          <p id={helpId} className="text-xs text-slate-400 mt-1">
            Drop a file or click to browse ({accept})
          </p>
        </div>
      )}
    </div>
  );
}
