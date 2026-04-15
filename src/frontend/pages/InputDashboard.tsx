import { useState, useCallback, useRef, useEffect } from "react";
import {
  MicrophoneIcon,
  DocumentTextIcon,
  BeakerIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { FileDropZone } from "../components/ui/FileDropZone";
import { submitDiagnosis } from "../api/client";
import type { DiagnoseRequest } from "../api/types";

interface InputDashboardProps {
  onSubmit: (jobId: string, payload: DiagnoseRequest) => void;
}

const MAX_CHARS = 50_000;
const STORAGE_KEY = "ddx_draft";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent h-10";
const textareaClass =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y";

interface Draft {
  age: string;
  sex: string;
  chiefComplaint: string;
  medicalHistory: string;
  transcript: string;
  labResults: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const pct = len / max;
  const nearLimit = pct > 0.8;
  const overLimit = len > max;
  return (
    <span
      className={`text-xs tabular-nums transition-colors ${
        overLimit
          ? "text-danger font-medium"
          : nearLimit
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-400 dark:text-slate-500"
      }`}
    >
      {len.toLocaleString()}/{max.toLocaleString()}
    </span>
  );
}

export function InputDashboard({ onSubmit }: InputDashboardProps) {
  const draft = loadDraft();
  const [age, setAge] = useState(draft?.age ?? "");
  const [sex, setSex] = useState(draft?.sex ?? "");
  const [chiefComplaint, setChiefComplaint] = useState(
    draft?.chiefComplaint ?? "",
  );
  const [medicalHistory, setMedicalHistory] = useState(
    draft?.medicalHistory ?? "",
  );
  const [transcript, setTranscript] = useState(draft?.transcript ?? "");
  const [labResults, setLabResults] = useState(draft?.labResults ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVoiceTarget, setActiveVoiceTarget] = useState<
    "history" | "transcript" | null
  >(null);
  const [touched, setTouched] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Persist draft on change
  useEffect(() => {
    saveDraft({
      age,
      sex,
      chiefComplaint,
      medicalHistory,
      transcript,
      labResults,
    });
  }, [age, sex, chiefComplaint, medicalHistory, transcript, labResults]);

  const ageError = touched && age !== "" && !/^\d{1,3}$/.test(age);

  const historyLen = medicalHistory.length;
  const transcriptLen = transcript.length;
  const labLen = labResults.length;
  const anyOverLimit =
    historyLen > MAX_CHARS || transcriptLen > MAX_CHARS || labLen > MAX_CHARS;

  const canSubmit =
    !anyOverLimit &&
    !ageError &&
    Boolean(medicalHistory.trim() || transcript.trim() || labResults.trim());

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    }
    setActiveVoiceTarget(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const contextPrefix = [
        age && `Age: ${age}`,
        sex && `Sex: ${sex}`,
        chiefComplaint && `Chief Complaint: ${chiefComplaint}`,
      ]
        .filter(Boolean)
        .join("\n");

      const fullHistory = contextPrefix
        ? `${contextPrefix}\n\n${medicalHistory}`
        : medicalHistory;

      const payload: DiagnoseRequest = {
        medicalHistory: fullHistory,
        conversationTranscript: transcript,
        labResults,
      };
      const { jobId } = await submitDiagnosis(payload);
      clearDraft();
      onSubmit(jobId, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    age,
    sex,
    chiefComplaint,
    medicalHistory,
    transcript,
    labResults,
    onSubmit,
  ]);

  const handleClearAll = useCallback(() => {
    setAge("");
    setSex("");
    setChiefComplaint("");
    setMedicalHistory("");
    setTranscript("");
    setLabResults("");
    setError(null);
    setTouched(false);
    clearDraft();
  }, []);

  const handleVoiceInput = useCallback(
    (target: "history" | "transcript") => {
      stopVoiceInput();

      const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        alert("Voice input is not supported in this browser.");
        return;
      }

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      setActiveVoiceTarget(target);

      let lastIndex = 0;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const text = Array.from(event.results)
          .slice(lastIndex)
          .map((r: SpeechRecognitionResult) => r[0].transcript)
          .join(" ");
        lastIndex = event.results.length;

        if (target === "history") {
          setMedicalHistory((prev) => (prev ? prev + " " + text : text));
        } else {
          setTranscript((prev) => (prev ? prev + " " + text : text));
        }
      };

      recognition.onerror = () => stopVoiceInput();
      recognition.onend = () => {
        recognitionRef.current = null;
        setActiveVoiceTarget(null);
      };
      recognition.start();
    },
    [stopVoiceInput],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display">New Case</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enter patient data to generate a differential diagnosis.
          </p>
        </div>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-danger transition-colors mt-1"
          title="Clear all fields"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Clear All
        </button>
      </div>

      {/* Patient Context */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
          Patient Context
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Age</label>
            <input
              type="text"
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                setTouched(true);
              }}
              placeholder="e.g., 45"
              className={`${inputClass} ${ageError ? "border-danger focus:ring-danger" : ""}`}
            />
            {ageError && (
              <p className="text-xs text-danger mt-1">
                Age must be a number (1–3 digits)
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className={inputClass}
            >
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Chief Complaint
            </label>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g., Chest pain, shortness of breath"
              className={inputClass}
            />
          </div>
        </div>
      </Card>

      {/* Medical History */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Medical History
          </h2>
          <button
            onClick={() =>
              activeVoiceTarget === "history"
                ? stopVoiceInput()
                : handleVoiceInput("history")
            }
            className={`flex items-center gap-1 text-xs transition-colors ${
              activeVoiceTarget === "history"
                ? "text-red-500 hover:text-red-600"
                : "text-primary hover:text-primary-dark"
            }`}
            title={
              activeVoiceTarget === "history" ? "Stop dictation" : "Voice input"
            }
          >
            <MicrophoneIcon className="h-4 w-4" />
            {activeVoiceTarget === "history" ? "Stop" : "Dictate"}
          </button>
        </div>
        <div className="flex justify-end mb-1">
          <CharCount value={medicalHistory} max={MAX_CHARS} />
        </div>
        <textarea
          value={medicalHistory}
          onChange={(e) => setMedicalHistory(e.target.value)}
          placeholder="Past diagnoses, medications, allergies, family history...&#10;You can also paste EHR summaries or drop a file below."
          rows={4}
          className={textareaClass}
        />
        <div className="mt-3">
          <FileDropZone
            label="Upload medical history file"
            onFileContent={(content) =>
              setMedicalHistory((prev) =>
                prev ? prev + "\n\n" + content : content,
              )
            }
          />
        </div>
      </Card>

      {/* Conversation Transcript */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <DocumentTextIcon className="h-4 w-4" />
            Conversation Transcript
          </h2>
          <button
            onClick={() =>
              activeVoiceTarget === "transcript"
                ? stopVoiceInput()
                : handleVoiceInput("transcript")
            }
            className={`flex items-center gap-1 text-xs transition-colors ${
              activeVoiceTarget === "transcript"
                ? "text-red-500 hover:text-red-600"
                : "text-primary hover:text-primary-dark"
            }`}
            title={
              activeVoiceTarget === "transcript"
                ? "Stop dictation"
                : "Voice input"
            }
          >
            <MicrophoneIcon className="h-4 w-4" />
            {activeVoiceTarget === "transcript" ? "Stop" : "Dictate"}
          </button>
        </div>
        <div className="flex justify-end mb-1">
          <CharCount value={transcript} max={MAX_CHARS} />
        </div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Doctor-patient encounter notes or transcript..."
          rows={4}
          className={textareaClass}
        />
        <div className="mt-3">
          <FileDropZone
            label="Upload transcript file"
            onFileContent={(content) =>
              setTranscript((prev) =>
                prev ? prev + "\n\n" + content : content,
              )
            }
          />
        </div>
      </Card>

      {/* Lab Results */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <BeakerIcon className="h-4 w-4" />
            Lab Results
          </h2>
          <div className="w-20" /> {/* spacer to align with voice buttons */}
        </div>
        <div className="flex justify-end mb-1">
          <CharCount value={labResults} max={MAX_CHARS} />
        </div>
        <textarea
          value={labResults}
          onChange={(e) => setLabResults(e.target.value)}
          placeholder="Blood panels, urinalysis, imaging reports..."
          rows={4}
          className={textareaClass}
        />
        <div className="mt-3">
          <FileDropZone
            label="Upload lab results file"
            onFileContent={(content) =>
              setLabResults((prev) =>
                prev ? prev + "\n\n" + content : content,
              )
            }
          />
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="text-sm text-danger bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Validation hint */}
      {anyOverLimit && (
        <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          One or more fields exceed the character limit. Please shorten before
          submitting.
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? "Submitting..." : "Submit for Diagnosis"}
        </Button>
      </div>
    </div>
  );
}
