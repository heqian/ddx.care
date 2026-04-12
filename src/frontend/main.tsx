import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { InputDashboard } from "./pages/InputDashboard";
import { WaitingRoom } from "./pages/WaitingRoom";
import { ResultsView } from "./pages/ResultsView";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { submitDiagnosis } from "./api/client";
import type { StatusResponse, DiagnoseRequest } from "./api/types";

type Screen = "input" | "waiting" | "results";

function App() {
  const [screen, setScreen] = useState<Screen>("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<StatusResponse | null>(null);
  const lastPayload = useRef<DiagnoseRequest | null>(null);
  const [retrying, setRetrying] = useState(false);

  const hasPatientData = screen !== "input";

  const handleReset = useCallback(() => {
    setJobId(null);
    setJobResult(null);
    setScreen("input");
  }, []);

  const { showWarning, extendSession } = useAutoLogout(handleReset);

  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPatientData]);

  const handleSubmit = useCallback((newJobId: string, payload: DiagnoseRequest) => {
    lastPayload.current = payload;
    setJobId(newJobId);
    setScreen("waiting");
  }, []);

  const handleComplete = useCallback((result: StatusResponse) => {
    setJobResult(result);
    setScreen("results");
  }, []);

  const handleCancel = useCallback(() => {
    setJobId(null);
    setJobResult(null);
    setScreen("input");
  }, []);

  const handleRetry = useCallback(async () => {
    if (!lastPayload.current) {
      handleCancel();
      return;
    }
    setRetrying(true);
    try {
      const { jobId: newJobId } = await submitDiagnosis(lastPayload.current);
      setJobId(newJobId);
      setJobResult(null);
      setScreen("waiting");
    } catch {
      handleCancel();
    } finally {
      setRetrying(false);
    }
  }, [handleCancel]);

  return (
    <AppShell>
      {showWarning && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-yellow-800 dark:text-yellow-400">
            Session will expire soon due to inactivity. Patient data will be cleared.
          </p>
          <button
            onClick={extendSession}
            className="text-sm font-medium text-yellow-800 dark:text-yellow-400 hover:underline"
          >
            Continue Session
          </button>
        </div>
      )}

      {screen === "input" && <InputDashboard onSubmit={handleSubmit} />}
      {screen === "waiting" && jobId && (
        <WaitingRoom
          jobId={jobId}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onRetry={retrying ? handleCancel : handleRetry}
        />
      )}
      {screen === "results" && jobResult && (
        <ResultsView result={jobResult} onNewCase={handleReset} />
      )}
    </AppShell>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
