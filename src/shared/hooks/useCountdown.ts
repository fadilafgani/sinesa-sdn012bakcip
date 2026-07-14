import { useState, useEffect, useRef } from 'react';

export const useCountdown = (initialSeconds: number, onComplete?: () => void) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const callbackRef = useRef(onComplete);

  useEffect(() => {
    callbackRef.current = onComplete;
  }, [onComplete]);

  // Sync state when the caller changes the initial value (e.g., stage switch waiting→countdown)
  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      callbackRef.current?.();
      return;
    }

    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds]);

  return seconds;
};
export default useCountdown;
