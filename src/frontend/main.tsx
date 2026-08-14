import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ConsentGate, useConsent } from "./components/layout/ConsentGate";
import {
  InputDashboard,
  type InputDashboardHandle,
} from "./pages/InputDashboard";
import { WaitingRoom } from "./pages/WaitingRoom";
import { ResultsView } from "./pages/ResultsView";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { useRouter, type Route } from "./hooks/useRouter";
import { Spinner } from "./components/ui/Spinner";
import {
  cancelDiagnosis,
  getJobStatus,
  submitDiagnosis,
  type ApiError,
} from "./api/client";
import type { DiagnoseRequest, StatusResponse } from "./api/types";
import { jobContextReducer, type JobAuthorizationState } from "./job-context";
import {
  clearSensitiveSessionData,
  getJobCredential,
  removeJobCredential,
  storeJobCredential,
} from "./job-credentials";

function routeJobId(route: Route): string | null {
  return route.screen === "input" ? null : route.jobId;
}

function UnavailableJob({
  authorization,
  onReset,
}: {
  authorization: Exclude<JobAuthorizationState, "available">;
  onReset: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-4">
      <h1 className="text-xl font-display">Case Access Unavailable</h1>
      <p className="text-slate-700 dark:text-slate-300 text-sm">
        {authorization === "expired"
          ? "Authorization for this case has expired. Start a new case to continue."
          : "This case is not available in the current browser session."}
      </p>
      <button
        onClick={onReset}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
      >
        New Case
      </button>
    </div>
  );
}

function App() {
  const { route, navigate } = useRouter();
  const { accepted, grant } = useConsent();
  const [jobs, dispatch] = useReducer(jobContextReducer, {});
  const jobsRef = useRef(jobs);
  const routeRef = useRef(route);
  jobsRef.current = jobs;
  routeRef.current = route;

  const activeJobId = routeJobId(route);
  const activeContext = activeJobId ? jobs[activeJobId] : undefined;
  const hasPatientData = route.screen !== "input";

  // Ref to InputDashboard so the inactivity purge can drive
  // stopVoiceInput and clearAll imperatively without lifting the
  // form's local field state.
  const inputDashboardRef = useRef<InputDashboardHandle | null>(null);

  // After the inactivity purge fires, we render a locked view instead
  // of navigating back to a still-populated input page. Tapping the
  // "Continue" button dismisses the lock and shows a blank input.
  const [locked, setLocked] = useState(false);

  const handleReset = useCallback(() => {
    clearSensitiveSessionData();
    dispatch({ type: "clear" });
    navigate({ screen: "input" }, { replace: true });
  }, [navigate]);

  const purgeSensitiveSession = useCallback(() => {
    // Stop voice dictation inside InputDashboard if it is mounted.
    inputDashboardRef.current?.stopVoiceInput();
    // Clear the form fields and the sessionStorage draft.
    inputDashboardRef.current?.clearAll();
    // Clear job credentials + draft from sessionStorage and in-memory jobs.
    clearSensitiveSessionData();
    dispatch({ type: "clear" });
    // Replace the current history entry with a neutral, credential-free
    // route so browser back navigation cannot recover case content or
    // capability URLs.
    window.history.replaceState({ screen: "input" }, "", "/");
    navigate({ screen: "input" }, { replace: true });
    // Render the locked view rather than a flash of populated input.
    setLocked(true);
  }, [navigate]);

  const { showWarning, extendSession } = useAutoLogout(purgeSensitiveSession, {
    screen: route.screen,
  });

  useEffect(() => {
    if (!activeJobId) return;
    const lookup = getJobCredential(activeJobId);
    if (lookup.status === "available") {
      const existing = jobsRef.current[activeJobId];
      if (
        !existing ||
        existing.token !== lookup.credential.token ||
        existing.wsTicket !== lookup.credential.wsTicket ||
        existing.expiresAt !== lookup.credential.expiresAt
      ) {
        dispatch({
          type: "register",
          ...lookup.credential,
          payload: existing?.payload,
        });
      }
      dispatch({ type: "streamStarted", jobId: activeJobId });
      return;
    }
    dispatch({
      type: "authorizationChanged",
      jobId: activeJobId,
      authorization: lookup.status,
    });
  }, [activeJobId]);

  useEffect(() => {
    if (
      route.screen !== "results" ||
      !activeContext ||
      activeContext.authorization !== "available" ||
      activeContext.status?.status === "completed" ||
      activeContext.status?.status === "failed"
    ) {
      return;
    }

    const controller = new AbortController();
    const { jobId, token, generation } = activeContext;
    getJobStatus(jobId, token, controller.signal)
      .then((status) => {
        dispatch({ type: "statusReceived", jobId, generation, status });
      })
      .catch((value: ApiError) => {
        if (controller.signal.aborted) return;
        if (value.status === 403) {
          removeJobCredential(jobId);
          dispatch({
            type: "authorizationChanged",
            jobId,
            authorization: "expired",
          });
          return;
        }
        dispatch({
          type: "streamError",
          jobId,
          generation,
          error: "Could not load results for this case.",
        });
      });
    return () => controller.abort();
  }, [
    route.screen,
    activeContext?.jobId,
    activeContext?.token,
    activeContext?.generation,
    activeContext?.authorization,
    activeContext?.status?.status,
  ]);

  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPatientData]);

  const handleSubmit = useCallback(
    (
      jobId: string,
      payload: DiagnoseRequest,
      token: string,
      wsTicket: string,
    ) => {
      const credential = storeJobCredential(jobId, token, wsTicket);
      dispatch({ type: "register", ...credential, payload });
      navigate({ screen: "waiting", jobId });
    },
    [navigate],
  );

  const handleStatus = useCallback(
    (status: StatusResponse, generation: number) => {
      dispatch({
        type: "statusReceived",
        jobId: status.jobId,
        generation,
        status,
      });
    },
    [],
  );

  const handleStreamError = useCallback(
    (error: Error | null, generation: number) => {
      const current = routeRef.current;
      if (current.screen !== "waiting") return;
      dispatch({
        type: "streamError",
        jobId: current.jobId,
        generation,
        error: error?.message ?? null,
      });
    },
    [],
  );

  const handleComplete = useCallback(
    (status: StatusResponse) => {
      const current = routeRef.current;
      if (
        current.screen !== "waiting" ||
        current.jobId !== status.jobId ||
        status.status !== "completed"
      ) {
        return;
      }
      navigate({ screen: "results", jobId: status.jobId }, { replace: true });
    },
    [navigate],
  );

  const leaveJob = useCallback(() => {
    const current = routeRef.current;
    if (current.screen !== "input") {
      removeJobCredential(current.jobId);
      dispatch({ type: "remove", jobId: current.jobId });
    }
    navigate({ screen: "input" }, { replace: true });
  }, [navigate]);

  const handleCancel = useCallback(() => {
    const current = routeRef.current;
    if (current.screen === "waiting") {
      const context = jobsRef.current[current.jobId];
      if (context?.authorization === "available") {
        void cancelDiagnosis(current.jobId, context.token).catch(() => {});
      }
    }
    leaveJob();
  }, [leaveJob]);

  const handleRetry = useCallback(async () => {
    const sourceRoute = routeRef.current;
    if (sourceRoute.screen === "input") return;
    const source = jobsRef.current[sourceRoute.jobId];
    if (!source?.payload || source.retrying) {
      leaveJob();
      return;
    }

    dispatch({
      type: "retryingChanged",
      jobId: source.jobId,
      retrying: true,
    });
    try {
      const response = await submitDiagnosis(source.payload);
      const current = routeRef.current;
      if (
        current.screen !== sourceRoute.screen ||
        current.jobId !== sourceRoute.jobId
      ) {
        return;
      }
      const credential = storeJobCredential(
        response.jobId,
        response.token,
        response.wsTicket,
      );
      dispatch({
        type: "register",
        ...credential,
        payload: source.payload,
      });
      navigate({ screen: "waiting", jobId: response.jobId });
    } catch {
      const current = routeRef.current;
      if (
        current.screen === sourceRoute.screen &&
        current.jobId === sourceRoute.jobId
      ) {
        dispatch({
          type: "streamError",
          jobId: source.jobId,
          generation: source.generation,
          error: "Could not retry this case.",
        });
      }
    } finally {
      dispatch({
        type: "retryingChanged",
        jobId: source.jobId,
        retrying: false,
      });
    }
  }, [leaveJob, navigate]);

  if (!accepted) {
    return <ConsentGate onAccept={grant} />;
  }

  if (locked) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <h1 className="text-xl font-display">Session Locked</h1>
          <p className="text-slate-700 dark:text-slate-300 text-sm">
            Your session was locked due to inactivity. Patient data has been
            cleared from this device.
          </p>
          <button
            type="button"
            onClick={() => setLocked(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
          >
            Continue
          </button>
        </div>
      </AppShell>
    );
  }

  const authorization = activeContext?.authorization;
  const availableContext =
    activeContext?.authorization === "available" ? activeContext : null;
  const routeStatus =
    availableContext?.status?.jobId === activeJobId
      ? availableContext.status
      : null;

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
        <InputDashboard ref={inputDashboardRef} onSubmit={handleSubmit} />
      )}
      {route.screen !== "input" &&
        authorization &&
        authorization !== "available" && (
          <UnavailableJob authorization={authorization} onReset={handleReset} />
        )}
      {route.screen === "waiting" && availableContext && (
        <WaitingRoom
          jobId={route.jobId}
          token={availableContext.token}
          wsTicket={availableContext.wsTicket}
          generation={availableContext.generation}
          onStatus={handleStatus}
          onStreamError={handleStreamError}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onRetry={handleRetry}
          retrying={availableContext.retrying}
        />
      )}
      {route.screen === "results" &&
        availableContext &&
        routeStatus?.status === "completed" && (
          <ResultsView
            result={routeStatus}
            onNewCase={handleReset}
            onRetry={handleRetry}
            retrying={availableContext.retrying}
          />
        )}
      {route.screen === "results" &&
        availableContext &&
        routeStatus?.status === "failed" && (
          <div className="max-w-md mx-auto text-center py-16 space-y-4">
            <p className="text-slate-700 dark:text-slate-300 text-sm">
              {routeStatus.error ||
                "An error occurred while processing this case."}
            </p>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
            >
              New Case
            </button>
          </div>
        )}
      {route.screen === "results" &&
        availableContext &&
        routeStatus?.status !== "completed" &&
        routeStatus?.status !== "failed" &&
        !availableContext.streamError && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Spinner />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading results...
            </p>
          </div>
        )}
      {route.screen === "results" && availableContext?.streamError && (
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm">
            {availableContext.streamError}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() =>
                dispatch({ type: "streamStarted", jobId: route.jobId })
              }
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
root.render(<App />);
