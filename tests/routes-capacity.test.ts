import { describe, expect, test } from "bun:test";
import {
  createRoutes,
  type RouteDependencies,
} from "../src/backend/api/routes";
import type { JobEntry } from "../src/backend/progress-store";
import type { ReportOutcome } from "../src/shared/report-outcome";
import { RateLimiter } from "../src/backend/utils/rate-limiter";

const input = {
  medicalHistory: "Capacity test history",
  conversationTranscript: "Capacity test transcript",
  labResults: "Capacity test labs",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createJobStore(createError?: Error) {
  const jobs = new Map<string, JobEntry>();
  return {
    jobs,
    createJob(jobId: string) {
      if (createError) throw createError;
      jobs.set(jobId, {
        status: "pending",
        createdAt: Date.now(),
        progress: [],
      });
    },
    getJob(jobId: string) {
      return jobs.get(jobId);
    },
    complete(jobId: string, result: ReportOutcome) {
      const job = jobs.get(jobId);
      if (job?.status !== "pending") return;
      jobs.set(jobId, { ...job, status: "completed", result });
    },
    fail(jobId: string, error: string) {
      const job = jobs.get(jobId);
      if (job?.status !== "pending") return;
      jobs.set(jobId, { ...job, status: "failed", error });
    },
    healthCheck() {
      return true;
    },
  };
}

function createAbortStore() {
  const controllers = new Map<string, AbortController>();
  return {
    controllers,
    set(jobId: string, controller: AbortController) {
      controllers.set(jobId, controller);
    },
    get(jobId: string) {
      return controllers.get(jobId);
    },
    remove(jobId: string) {
      controllers.delete(jobId);
    },
  };
}

function createHarness(
  dependencies: RouteDependencies,
  jobIds = ["00000000-0000-4000-a000-000000000001"],
) {
  let nextJobId = 0;
  const routes = createRoutes(
    { upgrade: () => false, requestIP: () => null },
    null,
    {
      generateJobId: () => jobIds[nextJobId++]!,
      ...dependencies,
    },
  );
  const diagnose = routes["/v1/diagnose"];
  const cancel = routes["/v1/diagnose/:jobId"];

  return {
    post: () =>
      diagnose.POST(
        new Request("http://localhost/v1/diagnose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    delete: (jobId: string) => {
      const request = Object.assign(
        new Request(`http://localhost/v1/diagnose/${jobId}`, {
          method: "DELETE",
        }),
        { params: { jobId } },
      );
      return cancel.DELETE(request);
    },
  };
}

function createLimiter(maxConcurrent = 1) {
  return new RateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    maxConcurrent,
  });
}

describe("Diagnosis startup capacity compensation", () => {
  test("releases the exact reservation when job creation throws", async () => {
    const limiter = createLimiter();
    const jobs = createJobStore(new Error("database unavailable"));
    const aborts = createAbortStore();
    const routes = createHarness({
      rateLimiter: limiter,
      progressStore: jobs,
      abortStore: aborts,
      createWorkflowRun: async () => {
        throw new Error("must not be reached");
      },
    });

    const response = await routes.post();

    expect(response.status).toBe(500);
    expect(limiter.activeWorkflows).toBe(0);
    expect(jobs.jobs.size).toBe(0);
    expect(aborts.controllers.size).toBe(0);
  });

  test("fails the initialized job when run creation throws", async () => {
    const limiter = createLimiter();
    const jobs = createJobStore();
    const aborts = createAbortStore();
    const jobId = "00000000-0000-4000-a000-000000000001";
    const routes = createHarness({
      rateLimiter: limiter,
      progressStore: jobs,
      abortStore: aborts,
      createWorkflowRun: async () => {
        throw new Error("provider details");
      },
    });

    const response = await routes.post();

    expect(response.status).toBe(500);
    expect(limiter.activeWorkflows).toBe(0);
    expect(jobs.getJob(jobId)).toMatchObject({
      status: "failed",
      error: "Diagnosis workflow failed to start",
    });
    expect(aborts.controllers.size).toBe(0);
  });

  test("removes the controller and fails the job when start throws", async () => {
    const limiter = createLimiter();
    const jobs = createJobStore();
    const aborts = createAbortStore();
    const jobId = "00000000-0000-4000-a000-000000000001";
    const routes = createHarness({
      rateLimiter: limiter,
      progressStore: jobs,
      abortStore: aborts,
      createWorkflowRun: async () => ({
        start() {
          throw new Error("synchronous start failure");
        },
      }),
    });

    const response = await routes.post();

    expect(response.status).toBe(500);
    expect(limiter.activeWorkflows).toBe(0);
    expect(jobs.getJob(jobId)).toMatchObject({
      status: "failed",
      error: "Diagnosis workflow failed to start",
    });
    expect(aborts.controllers.size).toBe(0);
  });
});

describe("Settlement-aware workflow capacity", () => {
  test("cancellation remains counted and repeated DELETE is idempotent", async () => {
    const limiter = createLimiter();
    const jobs = createJobStore();
    const aborts = createAbortStore();
    const workflow = deferred<unknown>();
    const firstJobId = "00000000-0000-4000-a000-000000000001";
    const routes = createHarness(
      {
        rateLimiter: limiter,
        progressStore: jobs,
        abortStore: aborts,
        createWorkflowRun: async () => ({
          start: () => workflow.promise,
        }),
      },
      [firstJobId, "00000000-0000-4000-a000-000000000002"],
    );

    expect((await routes.post()).status).toBe(202);
    expect(limiter.activeWorkflows).toBe(1);

    expect(await (await routes.delete(firstJobId)).json()).toEqual({
      status: "cancelled",
    });
    expect(limiter.activeWorkflows).toBe(1);
    expect(aborts.controllers.get(firstJobId)?.signal.aborted).toBe(true);

    expect(await (await routes.delete(firstJobId)).json()).toEqual({
      status: "cancelled",
    });
    expect(limiter.activeWorkflows).toBe(1);
    expect((await routes.post()).status).toBe(429);

    workflow.reject(new Error("Diagnosis cancelled by user"));
    await Bun.sleep(0);

    expect(limiter.activeWorkflows).toBe(0);
    expect(aborts.controllers.has(firstJobId)).toBe(false);
    expect(jobs.getJob(firstJobId)?.error).toBe("Cancelled by user");
  });

  test("DELETE preserves an existing non-cancellation failure", async () => {
    const limiter = createLimiter();
    const jobs = createJobStore();
    const aborts = createAbortStore();
    const jobId = "00000000-0000-4000-a000-000000000001";
    jobs.createJob(jobId);
    jobs.fail(jobId, "Provider unavailable");
    const routes = createHarness({
      rateLimiter: limiter,
      progressStore: jobs,
      abortStore: aborts,
    });

    expect(await (await routes.delete(jobId)).json()).toEqual({
      status: "failed",
    });
    expect(jobs.getJob(jobId)?.error).toBe("Provider unavailable");
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("never admits more unsettled work than configured capacity", async () => {
    const maxConcurrent = 2;
    const limiter = createLimiter(maxConcurrent);
    const jobs = createJobStore();
    const aborts = createAbortStore();
    const workflows: Array<ReturnType<typeof deferred<unknown>>> = [];
    let unsettled = 0;
    let maxUnsettled = 0;
    const jobIds = Array.from(
      { length: 20 },
      (_, index) =>
        `00000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`,
    );
    const routes = createHarness(
      {
        rateLimiter: limiter,
        progressStore: jobs,
        abortStore: aborts,
        createWorkflowRun: async () => ({
          start() {
            const workflow = deferred<unknown>();
            workflows.push(workflow);
            unsettled++;
            maxUnsettled = Math.max(maxUnsettled, unsettled);
            return workflow.promise.finally(() => {
              unsettled--;
            });
          },
        }),
      },
      jobIds,
    );

    for (let batch = 0; batch < 5; batch++) {
      const responses = await Promise.all([
        routes.post(),
        routes.post(),
        routes.post(),
        routes.post(),
      ]);
      expect(responses.filter(({ status }) => status === 202)).toHaveLength(2);
      expect(responses.filter(({ status }) => status === 429)).toHaveLength(2);
      expect(unsettled).toBe(maxConcurrent);
      expect(limiter.activeWorkflows).toBe(maxConcurrent);

      const current = workflows.splice(0);
      for (const workflow of current) {
        workflow.reject(new Error("stress settlement"));
      }
      await Bun.sleep(0);
      expect(unsettled).toBe(0);
      expect(limiter.activeWorkflows).toBe(0);
    }

    expect(maxUnsettled).toBe(maxConcurrent);
  });
});
