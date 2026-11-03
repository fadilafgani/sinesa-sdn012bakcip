import { useState, useEffect, useRef } from 'react';

export interface UseCountdownOptions {
  expiresAt?: string | null;
  serverTimeOffset?: number;
  duration?: number;
  enabled?: boolean;
  onComplete?: () => void;
}

export const useCountdown = (
  optionsOrSeconds: number | UseCountdownOptions,
  legacyOnComplete?: () => void
) => {
  const isOptions = typeof optionsOrSeconds === 'object' && optionsOrSeconds !== null;
  const initialSeconds = isOptions ? (optionsOrSeconds.duration ?? 3) : optionsOrSeconds;
  const expiresAt = isOptions ? optionsOrSeconds.expiresAt : null;
  const serverTimeOffset = isOptions ? (optionsOrSeconds.serverTimeOffset ?? 0) : 0;
  const enabled = isOptions ? (optionsOrSeconds.enabled ?? true) : true;
  const onComplete = isOptions ? optionsOrSeconds.onComplete : legacyOnComplete;

  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef<boolean>(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset completion flag whenever target expiry changes
  useEffect(() => {
    hasCompletedRef.current = false;
  }, [expiresAt, enabled]);

  useEffect(() => {
    if (!enabled) {
      setSeconds(0);
      return;
    }

    // Mode A: Shared Server Timestamp Anchor
    if (expiresAt) {
      const targetTime = new Date(expiresAt).getTime();

      const computeRemaining = () => {
        const serverNow = Date.now() - serverTimeOffset;
        const diffMs = targetTime - serverNow;
        if (diffMs <= 0) {
          return 0;
        }
        return Math.min(initialSeconds, Math.ceil(diffMs / 1000));
      };

      const checkCountdown = () => {
        const remaining = computeRemaining();
        setSeconds(remaining);

        if (remaining <= 0) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onCompleteRef.current?.();
          }
        }
      };

      checkCountdown();
      const interval = setInterval(checkCountdown, 50);
      return () => clearInterval(interval);
    }

    // Mode B: Local Second Decrement Fallback
    setSeconds(initialSeconds);
    if (initialSeconds <= 0) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onCompleteRef.current?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, serverTimeOffset, enabled, initialSeconds]);

  return seconds;
};

export default useCountdown;
