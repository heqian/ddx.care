import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { ConsentGate, useConsent } from "./components/layout/ConsentGate";
import { InputDashboard } from "./pages/InputDashboard";
import { WaitingRoom } from "./pages/WaitingRoom";
import { ResultsView } from "./pages/ResultsView";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { useRouter, type Route } from "./hooks/useRouter";
import { Spinner } from "./components/ui/Spinner";
import { submitDiagnosis, getJobStatus } from "./api/client";
import type { StatusResponse, DiagnoseRequest } from "./api/types";

function App() {
  const { route, navigate } = useRouter();
  const { accepted, grant, revoke } = useConsent();
  const [jobResult, setJobResult] = useState<StatusResponse | null>(null);
  const lastPayload = useRef<DiagnoseRequest | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState(false);
  const [wsToken, setWsToken] = useState<string>("");

  // When navigating to results via router (deep link / back button), fetch the result
  const _jobId =
    route.screen === "waiting" || route.screen === "results"
      ? route.jobId
      : null;

  const fetchDeepLink = useCallback(() => {
    if (route.screen === "results" && route.jobId && !jobResult) {
      setDeepLinkError(false);
      getJobStatus(route.jobId)
        .then((res) => {
          if (res.status === "completed" || res.status === "failed") {
            setJobResult(res);
          }
        })
        .catch(() => setDeepLinkError(true));
    }
  }, [route, jobResult]);

  useEffect(() => {
    fetchDeepLink();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPatientData = route.screen !== "input";

  const handleReset = useCallback(() => {
    setJobResult(null);
    navigate({ screen: "input" });
  }, [navigate]);

  const { showWarning, extendSession } = useAutoLogout(
    handleReset,
    route.screen === "waiting",
  );

  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPatientData]);

  const handleSubmit = useCallback(
    (newJobId: string, payload: DiagnoseRequest, token?: string) => {
      lastPayload.current = payload;
      setJobResult(null);
      setWsToken(token ?? "");
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

  if (!accepted) {
    return <ConsentGate onAccept={grant} onDecline={revoke} />;
  }

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

      {route.screen === "input" && <InputDashboard onSubmit={handleSubmit} />}
      {route.screen === "waiting" && (
        <WaitingRoom
          jobId={route.jobId}
          token={wsToken}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onRetry={retrying ? handleCancel : handleRetry}
        />
      )}
      {route.screen === "results" &&
        jobResult &&
        jobResult.status !== "failed" && (
          <ResultsView result={jobResult} onNewCase={handleReset} />
        )}
      {route.screen === "results" && jobResult?.status === "failed" && (
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm">
            {jobResult.error || "An error occurred while processing this case."}
          </p>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
          >
            New Case
          </button>
        </div>
      )}
      {route.screen === "results" && !jobResult && !deepLinkError && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading results...
          </p>
        </div>
      )}
      {route.screen === "results" && !jobResult && deepLinkError && (
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm">
            Could not load results for this case.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchDeepLink}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              New Case
            </button>
          </div>
        </div>
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
