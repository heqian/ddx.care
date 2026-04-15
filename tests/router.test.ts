import { test, expect, describe } from "bun:test";
import { parsePath, routeToPath } from "../src/frontend/hooks/useRouter";

describe("parsePath", () => {
  test("returns input screen for root path", () => {
    expect(parsePath("/")).toEqual({ screen: "input" });
  });

  test("returns input screen for unknown path", () => {
    expect(parsePath("/unknown")).toEqual({ screen: "input" });
  });

  test("returns input screen for empty string", () => {
    expect(parsePath("")).toEqual({ screen: "input" });
  });

  test("parses waiting route with jobId", () => {
    expect(parsePath("/waiting/abc-123")).toEqual({
      screen: "waiting",
      jobId: "abc-123",
    });
  });

  test("parses results route with jobId", () => {
    expect(parsePath("/results/xyz-456")).toEqual({
      screen: "results",
      jobId: "xyz-456",
    });
  });

  test("returns input for /waiting/ without jobId", () => {
    expect(parsePath("/waiting/")).toEqual({ screen: "input" });
  });

  test("returns input for /results/ without jobId", () => {
    expect(parsePath("/results/")).toEqual({ screen: "input" });
  });

  test("handles UUID-style jobId", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(parsePath(`/waiting/${uuid}`)).toEqual({
      screen: "waiting",
      jobId: uuid,
    });
  });
});

describe("routeToPath", () => {
  test("converts input route to root path", () => {
    expect(routeToPath({ screen: "input" })).toBe("/");
  });

  test("converts waiting route to waiting path", () => {
    expect(routeToPath({ screen: "waiting", jobId: "abc-123" })).toBe(
      "/waiting/abc-123",
    );
  });

  test("converts results route to results path", () => {
    expect(routeToPath({ screen: "results", jobId: "xyz-456" })).toBe(
      "/results/xyz-456",
    );
  });
});

describe("parsePath ↔ routeToPath round-trip", () => {
  test("round-trips for input route", () => {
    const route = { screen: "input" as const };
    expect(parsePath(routeToPath(route))).toEqual(route);
  });

  test("round-trips for waiting route", () => {
    const route = { screen: "waiting" as const, jobId: "test-job-id" };
    expect(parsePath(routeToPath(route))).toEqual(route);
  });

  test("round-trips for results route", () => {
    const route = { screen: "results" as const, jobId: "test-job-id" };
    expect(parsePath(routeToPath(route))).toEqual(route);
  });
});
