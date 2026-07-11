import { useState, useCallback, useEffect } from "react";

export type Route =
  | { screen: "input" }
  | { screen: "waiting"; jobId: string }
  | { screen: "results"; jobId: string; token?: string };

export function parsePath(path: string): Route {
  if (path.startsWith("/results/")) {
    const rest = path.slice("/results/".length);
    if (rest) {
      const [jobId, token] = rest.split("/");
      if (jobId) {
        return token
          ? { screen: "results", jobId, token }
          : { screen: "results", jobId };
      }
    }
  }
  if (path.startsWith("/waiting/")) {
    const jobId = path.slice("/waiting/".length);
    if (jobId) return { screen: "waiting", jobId };
  }
  return { screen: "input" };
}

export function routeToPath(route: Route): string {
  switch (route.screen) {
    case "waiting":
      return `/waiting/${route.jobId}`;
    case "results":
      return route.token
        ? `/results/${route.jobId}/${route.token}`
        : `/results/${route.jobId}`;
    default:
      return "/";
  }
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() =>
    parsePath(window.location.pathname),
  );

  const navigate = useCallback((next: Route) => {
    const path = routeToPath(next);
    window.history.pushState(next, "", path);
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state && typeof e.state === "object" && "screen" in e.state) {
        setRoute(e.state as Route);
      } else {
        setRoute(parsePath(window.location.pathname));
      }
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
