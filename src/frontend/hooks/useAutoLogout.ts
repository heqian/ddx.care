import { useEffect, useState, useRef, useCallback } from "react";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WARNING_MS = 2 * 60 * 1000; // 2 minutes before logout

export function useAutoLogout(onTimeout: () => void, paused = false) {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    setShowWarning(false);
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, TIMEOUT_MS - WARNING_MS);

    timerRef.current = setTimeout(() => {
      onTimeoutRef.current();
    }, TIMEOUT_MS);
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
  }, [reset, paused]);

  return { showWarning, extendSession: reset };
}
