import { useState, useCallback, useRef } from "react";
import {
  MicrophoneIcon,
  DocumentTextIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { FileDropZone } from "../components/ui/FileDropZone";
import { submitDiagnosis } from "../api/client";

interface InputDashboardProps {
  onSubmit: (jobId: string) => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";
const textareaClass = `${inputClass} resize-y`;

export function InputDashboard({ onSubmit }: InputDashboardProps) {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [transcript, setTranscript] = useState("");
  const [labResults, setLabResults] = useState("");
  const [showPiiModal, setShowPiiModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVoiceTarget, setActiveVoiceTarget] = useState<"history" | "transcript" | null>(null);
  const recognitionRef = useRef<any>(null);

  const canSubmit = medicalHistory.trim() && transcript.trim() && labResults.trim();

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    setActiveVoiceTarget(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Prepend patient context to medical history
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

      const { jobId } = await submitDiagnosis({
        medicalHistory: fullHistory,
        conversationTranscript: transcript,
        labResults,
      });
      onSubmit(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [age, sex, chiefComplaint, medicalHistory, transcript, labResults, onSubmit]);

  const handleVoiceInput = useCallback(
    (target: "history" | "transcript") => {
      // Stop any existing recognition first
      stopVoiceInput();

      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Voice input is not supported in this browser.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      setActiveVoiceTarget(target);

      let lastIndex = 0;

      recognition.onresult = (event: any) => {
        // Only process new results since last callback
        const text = Array.from(event.results)
          .slice(lastIndex)
          .map((r: any) => r[0].transcript)
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
      <div>
        <h1 className="text-2xl font-bold">New Case</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Enter patient data to generate a differential diagnosis.
        </p>
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
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g., 45"
              className={inputClass}
            />
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Medical History
          </h2>
          <button
            onClick={() => activeVoiceTarget === "history" ? stopVoiceInput() : handleVoiceInput("history")}
            className={`flex items-center gap-1 text-xs transition-colors ${
              activeVoiceTarget === "history"
                ? "text-red-500 hover:text-red-600"
                : "text-primary hover:text-primary-dark"
            }`}
            title={activeVoiceTarget === "history" ? "Stop dictation" : "Voice input"}
          >
            <MicrophoneIcon className="h-4 w-4" />
            {activeVoiceTarget === "history" ? "Stop" : "Dictate"}
          </button>
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
              setMedicalHistory((prev) => (prev ? prev + "\n\n" + content : content))
            }
          />
        </div>
      </Card>

      {/* Conversation Transcript */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <DocumentTextIcon className="h-4 w-4" />
            Conversation Transcript
          </h2>
          <button
            onClick={() => activeVoiceTarget === "transcript" ? stopVoiceInput() : handleVoiceInput("transcript")}
            className={`flex items-center gap-1 text-xs transition-colors ${
              activeVoiceTarget === "transcript"
                ? "text-red-500 hover:text-red-600"
                : "text-primary hover:text-primary-dark"
            }`}
            title={activeVoiceTarget === "transcript" ? "Stop dictation" : "Voice input"}
          >
            <MicrophoneIcon className="h-4 w-4" />
            {activeVoiceTarget === "transcript" ? "Stop" : "Dictate"}
          </button>
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
              setTranscript((prev) => (prev ? prev + "\n\n" + content : content))
            }
          />
        </div>
      </Card>

      {/* Lab Results */}
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
          <BeakerIcon className="h-4 w-4" />
          Lab Results
        </h2>
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
              setLabResults((prev) => (prev ? prev + "\n\n" + content : content))
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

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowPiiModal(true)}
          disabled={!canSubmit || submitting}
        >
          {submitting ? "Submitting..." : "Submit for Diagnosis"}
        </Button>
      </div>

      {/* PII Warning Modal */}
      <Modal
        open={showPiiModal}
        onClose={() => setShowPiiModal(false)}
        title="Privacy Reminder"
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>
            Before submitting, please confirm that the case data does
            <strong> not </strong> contain any of the following:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Patient names</li>
            <li>Dates of birth</li>
            <li>Medical record numbers (MRNs)</li>
            <li>Social security numbers</li>
            <li>Any other direct identifiers</li>
          </ul>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            All data is processed ephemerally and cleared when you close this
            session.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setShowPiiModal(false)}>
            Go Back
          </Button>
          <Button
            onClick={() => {
              setShowPiiModal(false);
              handleSubmit();
            }}
          >
            I Understand — Submit
          </Button>
        </div>
      </Modal>
    </div>
  );
}
