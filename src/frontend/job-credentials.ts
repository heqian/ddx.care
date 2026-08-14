export const JOB_CREDENTIALS_STORAGE_KEY = "ddx_job_credentials";
export const JOB_CREDENTIAL_TTL_MS = 60 * 60 * 1000;

interface StoredCredential {
  jobId: string;
  token: string;
  wsTicket: string;
  expiresAt: number;
}

interface CredentialStore {
  version: 1;
  jobs: Record<string, StoredCredential>;
}

export type CredentialLookup =
  | { status: "available"; credential: StoredCredential }
  | { status: "missing" }
  | { status: "expired" };

function emptyStore(): CredentialStore {
  return { version: 1, jobs: {} };
}

function isCredential(value: unknown, key: string): value is StoredCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Record<string, unknown>;
  return (
    Object.keys(credential).length === 4 &&
    credential.jobId === key &&
    typeof credential.token === "string" &&
    typeof credential.wsTicket === "string" &&
    typeof credential.expiresAt === "number" &&
    Number.isFinite(credential.expiresAt)
  );
}

function loadStore(): CredentialStore {
  try {
    const raw = sessionStorage.getItem(JOB_CREDENTIALS_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid store");
    const candidate = parsed as Record<string, unknown>;
    if (
      Object.keys(candidate).length !== 2 ||
      candidate.version !== 1 ||
      !candidate.jobs ||
      typeof candidate.jobs !== "object" ||
      Array.isArray(candidate.jobs)
    ) {
      throw new Error("invalid store");
    }
    const jobs = candidate.jobs as Record<string, unknown>;
    if (
      !Object.entries(jobs).every(([key, value]) => isCredential(value, key))
    ) {
      throw new Error("invalid credential");
    }
    return parsed as CredentialStore;
  } catch {
    clearJobCredentials();
    return emptyStore();
  }
}

function saveStore(store: CredentialStore): void {
  try {
    sessionStorage.setItem(JOB_CREDENTIALS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Recovery remains in memory when storage is unavailable.
  }
}

export function storeJobCredential(
  jobId: string,
  token: string,
  wsTicket: string = "",
  now = Date.now(),
): StoredCredential {
  const credential = {
    jobId,
    token,
    wsTicket,
    expiresAt: now + JOB_CREDENTIAL_TTL_MS,
  };
  const store = loadStore();
  store.jobs[jobId] = credential;
  saveStore(store);
  return credential;
}

export function getJobCredential(
  jobId: string,
  now = Date.now(),
): CredentialLookup {
  const store = loadStore();
  const credential = store.jobs[jobId];
  if (!credential) return { status: "missing" };
  if (credential.expiresAt <= now) {
    delete store.jobs[jobId];
    saveStore(store);
    return { status: "expired" };
  }
  return { status: "available", credential };
}

export function removeJobCredential(jobId: string): void {
  const store = loadStore();
  if (!store.jobs[jobId]) return;
  delete store.jobs[jobId];
  saveStore(store);
}

export function clearJobCredentials(): void {
  try {
    sessionStorage.removeItem(JOB_CREDENTIALS_STORAGE_KEY);
  } catch {
    // Storage cleanup is best effort when the browser blocks storage access.
  }
}

export function clearSensitiveSessionData(): void {
  clearJobCredentials();
  try {
    sessionStorage.removeItem("ddx_draft");
  } catch {
    // Storage cleanup is best effort when the browser blocks storage access.
  }
}
