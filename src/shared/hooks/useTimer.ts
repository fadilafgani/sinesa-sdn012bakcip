import { useState, useEffect, useRef } from 'react';

export interface UseTimerOptions {
  expiresAt: string | null;
  serverTimeOffset?: number;
  onTimeUp?: () => void;
  enabled: boolean;
  onTick?: (remainingMs: number, remainingSec: number) => void;
}

export const useTimer = ({
  expiresAt,
  serverTimeOffset = 0,
  onTimeUp,
  enabled,
  onTick,
}: UseTimerOptions): number => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const onTimeUpRef = useRef(onTimeUp);
  const onTickRef = useRef(onTick);
  const hasCompletedRef = useRef<boolean>(false);
  const hasTickedPositiveRef = useRef<boolean>(false);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  // Reset completion flag whenever target expiry changes
  useEffect(() => {
    hasCompletedRef.current = false;
    hasTickedPositiveRef.current = false;
  }, [expiresAt, enabled]);

  useEffect(() => {
    if (!enabled || !expiresAt) {
      setTimeLeft(0);
      return;
    }

    const targetTime = new Date(expiresAt).getTime();
    if (isNaN(targetTime)) {
      setTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const serverNow = Date.now() - serverTimeOffset;
      const remainingMs = Math.max(0, targetTime - serverNow);
      const remainingSec = Math.ceil(remainingMs / 1000);

      setTimeLeft(remainingSec);
      onTickRef.current?.(remainingMs, remainingSec);

      // Expose diagnostic metrics on window for high-precision telemetry validation
      if (typeof window !== 'undefined') {
        (window as any).__sinesaTimerMetrics = {
          expiresAt,
          targetTime,
          serverNow,
          serverTimeOffset,
          remainingMs,
          remainingSec,
          timestamp: Date.now(),
        };
      }

      if (remainingMs > 0) {
        hasTickedPositiveRef.current = true;
      }

      if (remainingMs <= 0) {
        if (!hasCompletedRef.current && hasTickedPositiveRef.current) {
          hasCompletedRef.current = true;
          onTimeUpRef.current?.();
        }
      }
    };

    // Immediate first check
    updateTimer();

    // High frequency interval (50ms) to eliminate boundary straddling phase jitter (quantization delay)
    const intervalId = window.setInterval(updateTimer, 50);

    // Immediate recheck when tab regains focus or visibility to defeat browser background tab throttling
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [expiresAt, serverTimeOffset, enabled]);

  return timeLeft;
};

export default useTimer;

