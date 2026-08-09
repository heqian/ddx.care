import type { DiagnoseRequest, StatusResponse } from "./api/types";

export type JobAuthorizationState = "available" | "missing" | "expired";

export interface JobContext {
  jobId: string;
  token: string;
  wsTicket: string;
  expiresAt: number;
  payload?: DiagnoseRequest;
  generation: number;
  status: StatusResponse | null;
  streamError: string | null;
  authorization: JobAuthorizationState;
  retrying: boolean;
}

export type JobContexts = Record<string, JobContext>;

export type JobContextAction =
  | {
      type: "register";
      jobId: string;
      token: string;
      wsTicket: string;
      expiresAt: number;
      payload?: DiagnoseRequest;
    }
  | { type: "streamStarted"; jobId: string }
  | {
      type: "statusReceived";
      jobId: string;
      generation: number;
      status: StatusResponse;
    }
  | {
      type: "streamError";
      jobId: string;
      generation: number;
      error: string | null;
    }
  | {
      type: "authorizationChanged";
      jobId: string;
      authorization: Exclude<JobAuthorizationState, "available">;
    }
  | { type: "retryingChanged"; jobId: string; retrying: boolean }
  | { type: "remove"; jobId: string }
  | { type: "clear" };

function isTerminal(status: StatusResponse | null): boolean {
  return status?.status === "completed" || status?.status === "failed";
}

export function jobContextReducer(
  state: JobContexts,
  action: JobContextAction,
): JobContexts {
  if (action.type === "clear") return {};

  if (action.type === "register") {
    return {
      ...state,
      [action.jobId]: {
        jobId: action.jobId,
        token: action.token,
        wsTicket: action.wsTicket,
        expiresAt: action.expiresAt,
        payload: action.payload,
        generation: 0,
        status: {
          jobId: action.jobId,
          status: "pending",
          progress: [],
        },
        streamError: null,
        authorization: "available",
        retrying: false,
      },
    };
  }

  if (action.type === "remove") {
    if (!state[action.jobId]) return state;
    const next = { ...state };
    delete next[action.jobId];
    return next;
  }

  const current = state[action.jobId];
  if (!current) {
    if (action.type !== "authorizationChanged") return state;
    return {
      ...state,
      [action.jobId]: {
        jobId: action.jobId,
        token: "",
        wsTicket: "",
        expiresAt: 0,
        generation: 0,
        status: null,
        streamError: null,
        authorization: action.authorization,
        retrying: false,
      },
    };
  }

  if (action.type === "streamStarted") {
    return {
      ...state,
      [action.jobId]: {
        ...current,
        generation: current.generation + 1,
        streamError: null,
      },
    };
  }

  if (action.type === "statusReceived") {
    if (
      action.generation !== current.generation ||
      action.status.jobId !== action.jobId ||
      (isTerminal(current.status) && !isTerminal(action.status))
    ) {
      return state;
    }
    return {
      ...state,
      [action.jobId]: {
        ...current,
        status: action.status,
        streamError: null,
      },
    };
  }

  if (action.type === "streamError") {
    if (
      action.generation !== current.generation ||
      isTerminal(current.status)
    ) {
      return state;
    }
    return {
      ...state,
      [action.jobId]: { ...current, streamError: action.error },
    };
  }

  if (action.type === "authorizationChanged") {
    return {
      ...state,
      [action.jobId]: {
        ...current,
        token: "",
        authorization: action.authorization,
      },
    };
  }

  return {
    ...state,
    [action.jobId]: { ...current, retrying: action.retrying },
  };
}
