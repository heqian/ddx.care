import { useState, useCallback, useEffect } from "react";

export type Route =
  | { screen: "input" }
  | { screen: "waiting"; jobId: string }
  | { screen: "results"; jobId: string };

function parseJobRoute(path: string, prefix: string): string | null {
  const parts = path.slice(prefix.length).split("/");
  if (parts.length !== 1 || !parts[0]) return null;
  try {
    return decodeURIComponent(parts[0]);
  } catch {
    return null;
  }
}

export function parsePath(path: string): Route {
  if (path.startsWith("/results/")) {
    const jobId = parseJobRoute(path, "/results/");
    if (jobId) return { screen: "results", jobId };
  }
  if (path.startsWith("/waiting/")) {
    const jobId = parseJobRoute(path, "/waiting/");
    if (jobId) return { screen: "waiting", jobId };
  }
  return { screen: "input" };
}

export function routeToPath(route: Route): string {
  switch (route.screen) {
    case "waiting":
      return `/waiting/${encodeURIComponent(route.jobId)}`;
    case "results":
      return `/results/${encodeURIComponent(route.jobId)}`;
    default:
      return "/";
  }
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() =>
    parsePath(window.location.pathname),
  );

  const navigate = useCallback(
    (next: Route, options?: { replace?: boolean }) => {
      const path = routeToPath(next);
      if (options?.replace) {
        window.history.replaceState(next, "", path);
      } else {
        window.history.pushState(next, "", path);
      }
      setRoute(next);
    },
    [],
  );

  useEffect(() => {
    const onPopState = () => {
      setRoute(parsePath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Replace current history entry so the initial route has state
  useEffect(() => {
    window.history.replaceState(route, "", routeToPath(route));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { route, navigate };
}
