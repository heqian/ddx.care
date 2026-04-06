import { useEffect, useState, useRef, useCallback } from "react";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WARNING_MS = 2 * 60 * 1000; // 2 minutes before logout

export function useAutoLogout(onTimeout: () => void) {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    reset();

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    for (const event of events) {
      window.addEventListener(event, reset);
    }

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
      for (const event of events) {
        window.removeEventListener(event, reset);
      }
    };
  }, [reset]);

  return { showWarning, extendSession: reset };
}
