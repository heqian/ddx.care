import { useEffect, useState, useRef, useCallback } from "react";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (input screen)
const DEFAULT_WAITING_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (waiting/results)
const WARNING_MS = 2 * 60 * 1000; // 2 minutes before logout

export type AutoLogoutScreen = "input" | "waiting" | "results";

export interface UseAutoLogoutOptions {
  /** Inactivity timeout for the input screen (default 10 min). */
  timeoutMs?: number;
  /** Extended inactivity timeout for waiting/results screens (default 15 min). */
  waitingTimeoutMs?: number;
  /** When true, the timer is paused (no warning, no timeout). */
  paused?: boolean;
  /** Current screen — determines which timeout applies. Defaults to "input". */
  screen?: AutoLogoutScreen;
}

export function useAutoLogout(
  onTimeout: () => void,
  options: UseAutoLogoutOptions = {},
) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    waitingTimeoutMs = DEFAULT_WAITING_TIMEOUT_MS,
    paused = false,
    screen = "input",
  } = options;

  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const effectiveTimeout =
    screen === "waiting" || screen === "results" ? waitingTimeoutMs : timeoutMs;

  // Keep the latest effective timeout in a ref so the reset callback closes
  // over the current value without re-creating on every render.
  const effectiveTimeoutRef = useRef(effectiveTimeout);
  effectiveTimeoutRef.current = effectiveTimeout;

  const reset = useCallback(() => {
    const current = effectiveTimeoutRef.current;
    const warningDelay = Math.max(0, current - WARNING_MS);
    setShowWarning(false);
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, warningDelay);

    timerRef.current = setTimeout(() => {
      onTimeoutRef.current();
    }, current);
  }, []);

  useEffect(() => {
    if (paused) {
      setShowWarning(false);
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
      return;
    }

    reset();

    const events: { name: string; options?: AddEventListenerOptions }[] = [
      { name: "mousemove", options: { passive: true } },
      { name: "keydown" },
      { name: "click" },
      { name: "scroll", options: { passive: true } },
      { name: "touchstart" },
    ];
    for (const { name, options } of events) {
      window.addEventListener(name, reset, options);
    }

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
      for (const { name, options } of events) {
        window.removeEventListener(name, reset, options);
      }
    };
  }, [reset, paused, effectiveTimeout]);

  return { showWarning, extendSession: reset };
}
