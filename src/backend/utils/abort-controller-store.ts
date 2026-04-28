const store = new Map<string, AbortController>();

export function set(jobId: string, controller: AbortController): void {
  store.set(jobId, controller);
}

export function get(jobId: string): AbortController | undefined {
  return store.get(jobId);
}

export function remove(jobId: string): void {
  store.delete(jobId);
}
