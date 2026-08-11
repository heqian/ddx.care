import {
  useState,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
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
  onSubmit: (
    jobId: string,
    payload: DiagnoseRequest,
    token: string,
    wsTicket: string,
  ) => void;
}

/**
 * Imperatively-exposed methods for the inactivity purge to drive
 * sensitive-state clearing inside InputDashboard without lifting
 * all of its local field state. `clearAll` clears every form field
 * and the `sessionStorage` draft; `stopVoiceInput` stops any active
 * voice dictation.
 */
export interface InputDashboardHandle {
  clearAll: () => void;
  stopVoiceInput: () => void;
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

function isAgeInvalid(age: string): boolean {
  return age !== "" && !/^\d{1,3}$/.test(age);
}

function hasClinicalContent(
  history: string,
  transcript: string,
  labs: string,
): boolean {
  return Boolean(history.trim() || transcript.trim() || labs.trim());
}

/**
 * Compose the `medicalHistory` payload sent to the backend. Age, Sex, and
 * Chief Complaint are prepended to the history text. The composed string must
 * satisfy the backend's per-field length limit, so validation and submission
 * share this single helper to stay in agreement.
 */
function composeMedicalHistory(
  age: string,
  sex: string,
  chiefComplaint: string,
  medicalHistory: string,
): string {
  const contextPrefix = [
    age && `Age: ${age}`,
    sex && `Sex: ${sex}`,
    chiefComplaint && `Chief Complaint: ${chiefComplaint}`,
  ]
    .filter(Boolean)
    .join("\n");

  return contextPrefix
    ? `${contextPrefix}\n\n${medicalHistory}`
    : medicalHistory;
}

interface CharCountProps {
  id: string;
  value: string;
  max: number;
}

function CharCount({ id, value, max }: CharCountProps) {
  const len = value.length;
  const pct = len / max;
  const nearLimit = pct > 0.8;
  const overLimit = len > max;
  return (
    <span
      id={id}
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

export const InputDashboard = forwardRef<
  InputDashboardHandle,
  InputDashboardProps
>(function InputDashboard({ onSubmit }, ref) {
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
  // Whether Age has been interacted with or validated by a submit attempt.
  // Drives whether the Age error is shown; submission sets this to true so an
  // invalid Age loaded from a draft is still validated.
  const [ageValidated, setAgeValidated] = useState(false);
  // Incremented on every failed client-validation attempt. The summary is
  // rendered while errors remain after an attempt; this counter drives the
  // refocus effect so repeated attempts refocus the summary.
  const [validationAttempt, setValidationAttempt] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Persist draft on change (debounced 500ms)
  useEffect(() => {
    const draft: Draft = {
      age,
      sex,
      chiefComplaint,
      medicalHistory,
      transcript,
      labResults,
    };
    const id = setTimeout(() => saveDraft(draft), 500);
    return () => clearTimeout(id);
  }, [age, sex, chiefComplaint, medicalHistory, transcript, labResults]);

  // Refocus the stable validation summary after every failed submit attempt,
  // including repeated attempts with unchanged errors.
  useEffect(() => {
    if (validationAttempt > 0 && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [validationAttempt]);

  const ageInvalid = isAgeInvalid(age);
  const ageError = ageValidated && ageInvalid;

  const historyOver = medicalHistory.length > MAX_CHARS;
  const transcriptOver = transcript.length > MAX_CHARS;
  const labsOver = labResults.length > MAX_CHARS;
  // The composed medicalHistory payload (patient-context prefix + history)
  // must also fit the backend per-field limit. When patient context is present
  // the composed length can exceed MAX_CHARS even when the textarea alone does
  // not, so the composed length is the authoritative history error.
  const historyComposedOver =
    composeMedicalHistory(age, sex, chiefComplaint, medicalHistory).length >
    MAX_CHARS;
  const historyError = historyOver || historyComposedOver;

  const clinicalEmpty = !hasClinicalContent(
    medicalHistory,
    transcript,
    labResults,
  );

  const hasClientErrors =
    clinicalEmpty || ageError || historyError || transcriptOver || labsOver;

  const showSummary = validationAttempt > 0 && hasClientErrors;

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;

      // Validate the current values independently of prior interaction so an
      // invalid Age loaded from a draft is still caught.
      setAgeValidated(true);

      const currentAgeError = isAgeInvalid(age);
      const currentHistoryComposedOver =
        composeMedicalHistory(age, sex, chiefComplaint, medicalHistory).length >
        MAX_CHARS;
      const currentTranscriptOver = transcript.length > MAX_CHARS;
      const currentLabsOver = labResults.length > MAX_CHARS;
      const currentClinicalEmpty = !hasClinicalContent(
        medicalHistory,
        transcript,
        labResults,
      );

      if (
        currentClinicalEmpty ||
        currentAgeError ||
        currentHistoryComposedOver ||
        currentTranscriptOver ||
        currentLabsOver
      ) {
        setValidationAttempt((n) => n + 1);
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const fullHistory = composeMedicalHistory(
          age,
          sex,
          chiefComplaint,
          medicalHistory,
        );

        const payload: DiagnoseRequest = {
          medicalHistory: fullHistory,
          conversationTranscript: transcript,
          labResults,
        };
        const { jobId, token, wsTicket } = await submitDiagnosis(payload);
        clearDraft();
        onSubmit(jobId, payload, token, wsTicket);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submission failed");
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      age,
      sex,
      chiefComplaint,
      medicalHistory,
      transcript,
      labResults,
      onSubmit,
    ],
  );

  const handleClearAll = useCallback(() => {
    setAge("");
    setSex("");
    setChiefComplaint("");
    setMedicalHistory("");
    setTranscript("");
    setLabResults("");
    setError(null);
    setAgeValidated(false);
    setValidationAttempt(0);
    clearDraft();
  }, []);

  // Expose stopVoiceInput and handleClearAll to the parent so the
  // inactivity purge can drive sensitive-state clearing.
  useImperativeHandle(
    ref,
    () => ({
      clearAll: handleClearAll,
      stopVoiceInput,
    }),
    [handleClearAll, stopVoiceInput],
  );

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

  const historyDescribedBy = `clinical-required-hint medical-history-instruction medical-history-count${
    historyError ? " medical-history-overlimit" : ""
  }`;
  const transcriptDescribedBy = `clinical-required-hint conversation-transcript-instruction conversation-transcript-count${
    transcriptOver ? " conversation-transcript-overlimit" : ""
  }`;
  const labsDescribedBy = `clinical-required-hint lab-results-instruction lab-results-count${
    labsOver ? " lab-results-overlimit" : ""
  }`;
  const ageDescribedBy = `age-hint${ageError ? " age-error" : ""}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display">New Case</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enter patient data to generate a differential diagnosis.
          </p>
        </div>
        <button
          type="button"
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
        <fieldset>
          <legend className="sr-only">Patient Context</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="age-input"
                className="block text-sm font-medium mb-1"
              >
                Age
              </label>
              <input
                id="age-input"
                name="age"
                type="text"
                inputMode="numeric"
                value={age}
                onChange={(e) => {
                  setAge(e.target.value);
                  setAgeValidated(true);
                }}
                placeholder="e.g., 45"
                aria-invalid={ageError || undefined}
                aria-describedby={ageDescribedBy}
                className={`${inputClass} ${ageError ? "border-danger focus:ring-danger" : ""}`}
              />
              <p
                id="age-hint"
                className="text-xs text-slate-400 dark:text-slate-500 mt-1"
              >
                Age in years; use 1 to 3 digits.
              </p>
              {ageError && (
                <p id="age-error" className="text-xs text-danger mt-1">
                  Age must be a number (1–3 digits).
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="sex-select"
                className="block text-sm font-medium mb-1"
              >
                Sex
              </label>
              <select
                id="sex-select"
                name="sex"
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
              <label
                htmlFor="chief-complaint-input"
                className="block text-sm font-medium mb-1"
              >
                Chief Complaint
              </label>
              <input
                id="chief-complaint-input"
                name="chiefComplaint"
                type="text"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g., Chest pain, shortness of breath"
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>
      </Card>

      {/* Shared clinical requirement */}
      <p
        id="clinical-required-hint"
        className="text-xs text-slate-500 dark:text-slate-400"
      >
        At least one of Medical History, Conversation Transcript, or Lab Results
        is required.
      </p>

      {/* Medical History */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <label htmlFor="medical-history-input">Medical History</label>
          </h2>
          <button
            type="button"
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
        <p
          id="medical-history-instruction"
          className="text-xs text-slate-500 dark:text-slate-400 mb-1"
        >
          Past diagnoses, medications, allergies, and family history.
        </p>
        <div className="flex justify-end mb-1">
          <CharCount
            id="medical-history-count"
            value={medicalHistory}
            max={MAX_CHARS}
          />
        </div>
        {historyError && (
          <p
            id="medical-history-overlimit"
            className="text-xs text-danger mb-1"
          >
            {historyOver
              ? "Medical History exceeds the 50,000-character limit."
              : "Medical History plus patient context exceeds the 50,000-character limit."}
          </p>
        )}
        <textarea
          id="medical-history-input"
          name="medicalHistory"
          value={medicalHistory}
          onChange={(e) => setMedicalHistory(e.target.value)}
          placeholder="You can paste EHR summaries or drop a file below."
          rows={4}
          aria-invalid={historyError || undefined}
          aria-describedby={historyDescribedBy}
          className={`${textareaClass} ${historyError ? "border-danger focus:ring-danger" : ""}`}
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
            <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
            <label htmlFor="conversation-transcript-input">
              Conversation Transcript
            </label>
          </h2>
          <button
            type="button"
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
        <p
          id="conversation-transcript-instruction"
          className="text-xs text-slate-500 dark:text-slate-400 mb-1"
        >
          Doctor-patient encounter notes or transcript.
        </p>
        <div className="flex justify-end mb-1">
          <CharCount
            id="conversation-transcript-count"
            value={transcript}
            max={MAX_CHARS}
          />
        </div>
        {transcriptOver && (
          <p
            id="conversation-transcript-overlimit"
            className="text-xs text-danger mb-1"
          >
            Conversation Transcript exceeds the 50,000-character limit.
          </p>
        )}
        <textarea
          id="conversation-transcript-input"
          name="conversationTranscript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Doctor-patient encounter notes or transcript..."
          rows={4}
          aria-invalid={transcriptOver || undefined}
          aria-describedby={transcriptDescribedBy}
          className={`${textareaClass} ${transcriptOver ? "border-danger focus:ring-danger" : ""}`}
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
            <BeakerIcon className="h-4 w-4" aria-hidden="true" />
            <label htmlFor="lab-results-input">Lab Results</label>
          </h2>
          <div /> {/* align with voice buttons */}
        </div>
        <p
          id="lab-results-instruction"
          className="text-xs text-slate-500 dark:text-slate-400 mb-1"
        >
          Blood panels, urinalysis, imaging reports.
        </p>
        <div className="flex justify-end mb-1">
          <CharCount
            id="lab-results-count"
            value={labResults}
            max={MAX_CHARS}
          />
        </div>
        {labsOver && (
          <p id="lab-results-overlimit" className="text-xs text-danger mb-1">
            Lab Results exceeds the 50,000-character limit.
          </p>
        )}
        <textarea
          id="lab-results-input"
          name="labResults"
          value={labResults}
          onChange={(e) => setLabResults(e.target.value)}
          placeholder="Blood panels, urinalysis, imaging reports..."
          rows={4}
          aria-invalid={labsOver || undefined}
          aria-describedby={labsDescribedBy}
          className={`${textareaClass} ${labsOver ? "border-danger focus:ring-danger" : ""}`}
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

      {/* Client-validation summary (single, focusable alert) */}
      {showSummary && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="text-sm text-danger bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <p className="font-medium">
            Please correct the following before submitting:
          </p>
          <ul className="list-disc ml-5 mt-1">
            {clinicalEmpty && (
              <li>
                Enter content in at least one field: Medical History,
                Conversation Transcript, or Lab Results.
              </li>
            )}
            {ageError && <li>Age must be a number using 1 to 3 digits.</li>}
            {historyError && (
              <li>
                {historyOver
                  ? "Medical History exceeds the 50,000-character limit."
                  : "Medical History plus patient context exceeds the 50,000-character limit."}
              </li>
            )}
            {transcriptOver && (
              <li>
                Conversation Transcript exceeds the 50,000-character limit.
              </li>
            )}
            {labsOver && (
              <li>Lab Results exceeds the 50,000-character limit.</li>
            )}
          </ul>
        </div>
      )}

      {/* Server error (distinct from client validation) */}
      {error && (
        <div
          role="alert"
          className="text-sm text-danger bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3"
        >
          {error}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">
        <p className="font-semibold text-red-600 dark:text-red-400">
          ⚠️ RESEARCH USE ONLY — NOT FOR CLINICAL USE — NOT HIPAA COMPLIANT
        </p>
        <p className="font-medium">
          This is a proof-of-concept demo for research purposes ONLY. It is not
          a medical device, has NO regulatory approval, and is NOT HIPAA
          compliant. DO NOT enter real patient data or protected health
          information (PHI).
        </p>
        <p>
          This tool must NOT be used for medical diagnosis, treatment, or
          patient care. AI-generated outputs have NO guarantee of accuracy.
          Never rely on this tool for medical decisions — always consult a
          qualified healthcare professional.
        </p>
        <p className="font-semibold text-red-600 dark:text-red-400">
          LEGAL DISCLAIMER: By submitting, you acknowledge this is a research
          demo. You accept ALL RISK and release the operators from ANY AND ALL
          LIABILITY for any outcomes arising from use of or reliance on these
          outputs. This tool is not intended to diagnose, treat, cure, or
          prevent any disease.
        </p>
      </div>

      {/* Autosave disclosure */}
      <p
        className="text-xs text-slate-400 dark:text-slate-500 text-center"
        role="note"
      >
        Drafts are auto-saved for this tab and cleared on inactivity or tab
        close.
      </p>

      {/* Submit */}
      <div className="flex justify-stretch sm:justify-end">
        <Button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto"
        >
          {submitting ? "Submitting..." : "Submit for Diagnosis"}
        </Button>
      </div>
    </form>
  );
});
