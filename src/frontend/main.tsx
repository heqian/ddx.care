import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { InputDashboard } from "./pages/InputDashboard";
import { WaitingRoom } from "./pages/WaitingRoom";
import { ResultsView } from "./pages/ResultsView";
import { useAutoLogout } from "./hooks/useAutoLogout";
import type { StatusResponse } from "./api/types";

type Screen = "input" | "waiting" | "results";

function App() {
  const [screen, setScreen] = useState<Screen>("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<StatusResponse | null>(null);

  const hasPatientData = screen !== "input";

  const handleReset = useCallback(() => {
    setJobId(null);
    setJobResult(null);
    setScreen("input");
  }, []);

  const { showWarning, extendSession } = useAutoLogout(handleReset);

  // Warn before closing/navigating away when patient data is present
  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPatientData]);

  const handleSubmit = (newJobId: string) => {
    setJobId(newJobId);
    setScreen("waiting");
  };

  const handleComplete = (result: StatusResponse) => {
    setJobResult(result);
    setScreen("results");
  };

  return (
    <AppShell>
      {/* Auto-logout warning banner */}
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
        <WaitingRoom jobId={jobId} onComplete={handleComplete} />
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
