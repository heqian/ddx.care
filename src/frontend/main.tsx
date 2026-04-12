import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { InputDashboard } from "./pages/InputDashboard";
import { WaitingRoom } from "./pages/WaitingRoom";
import { ResultsView } from "./pages/ResultsView";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { useRouter, type Route } from "./hooks/useRouter";
import { submitDiagnosis, getJobStatus } from "./api/client";
import type { StatusResponse, DiagnoseRequest } from "./api/types";

function App() {
  const { route, navigate } = useRouter();
  const [jobResult, setJobResult] = useState<StatusResponse | null>(null);
  const lastPayload = useRef<DiagnoseRequest | null>(null);
  const [retrying, setRetrying] = useState(false);

  // When navigating to results via router (deep link / back button), fetch the result
  const jobId =
    route.screen === "waiting" || route.screen === "results"
      ? route.jobId
      : null;

  useEffect(() => {
    if (route.screen === "results" && route.jobId && !jobResult) {
      getJobStatus(route.jobId)
        .then((res) => {
          if (res.status === "completed") setJobResult(res);
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPatientData = route.screen !== "input";

  const handleReset = useCallback(() => {
    setJobResult(null);
    navigate({ screen: "input" });
  }, [navigate]);

  const { showWarning, extendSession } = useAutoLogout(handleReset);

  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPatientData]);

  const handleSubmit = useCallback(
    (newJobId: string, payload: DiagnoseRequest) => {
      lastPayload.current = payload;
      setJobResult(null);
      navigate({ screen: "waiting", jobId: newJobId });
    },
    [navigate],
  );

  const handleComplete = useCallback(
    (result: StatusResponse) => {
      setJobResult(result);
      const jid = route.screen === "waiting" ? route.jobId : result.jobId;
      navigate({ screen: "results", jobId: jid });
    },
    [navigate, route],
  );

  const handleCancel = useCallback(() => {
    setJobResult(null);
    navigate({ screen: "input" });
  }, [navigate]);

  const handleRetry = useCallback(async () => {
    if (!lastPayload.current) {
      handleCancel();
      return;
    }
    setRetrying(true);
    try {
      const { jobId: newJobId } = await submitDiagnosis(lastPayload.current);
      setJobResult(null);
      navigate({ screen: "waiting", jobId: newJobId });
    } catch {
      handleCancel();
    } finally {
      setRetrying(false);
    }
  }, [handleCancel, navigate]);

  return (
    <AppShell>
      {showWarning && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-yellow-800 dark:text-yellow-400">
            Session will expire soon due to inactivity. Patient data will be
            cleared.
          </p>
          <button
            onClick={extendSession}
            className="text-sm font-medium text-yellow-800 dark:text-yellow-400 hover:underline"
          >
            Continue Session
          </button>
        </div>
      )}

      {route.screen === "input" && (
        <InputDashboard onSubmit={handleSubmit} />
      )}
      {route.screen === "waiting" && (
        <WaitingRoom
          jobId={route.jobId}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onRetry={retrying ? handleCancel : handleRetry}
        />
      )}
      {route.screen === "results" && jobResult && (
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
