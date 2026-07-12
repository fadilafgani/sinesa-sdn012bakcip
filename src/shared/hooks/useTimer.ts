import { useState, useEffect, useRef } from 'react';

export interface UseTimerOptions {
  expiresAt: string | null;
  serverTimeOffset?: number;
  onTimeUp?: () => void;
  enabled: boolean;
}

export const useTimer = ({ expiresAt, serverTimeOffset = 0, onTimeUp, enabled }: UseTimerOptions) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const onTimeUpRef = useRef(onTimeUp);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (!enabled) {
      setTimeLeft(0);
      return;
    }

    const expiresTime = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 30000;

    const updateTimer = () => {
      const serverNow = Date.now() - serverTimeOffset;
      const diff = Math.max(0, Math.round((expiresTime - serverNow) / 1000));
      setTimeLeft(diff);

      if (diff <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onTimeUpRef.current?.();
      }
    };

    updateTimer();
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = window.setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [expiresAt, serverTimeOffset, enabled]);

  return timeLeft;
};
export default useTimer;
