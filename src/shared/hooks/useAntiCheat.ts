import { useState, useEffect, useRef } from 'react';
import { useAnswer } from './useAnswer';

export interface UseAntiCheatOptions {
  enabled: boolean;
  onViolationTriggered?: (reason: string) => void;
}

export const useAntiCheat = ({ enabled, onViolationTriggered }: UseAntiCheatOptions) => {
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningReason, setWarningReason] = useState('');
  const { incrementViolation } = useAnswer();
  const triggerCallbackRef = useRef(onViolationTriggered);

  useEffect(() => {
    triggerCallbackRef.current = onViolationTriggered;
  }, [onViolationTriggered]);

  useEffect(() => {
    if (!enabled) return;

    // 1. Prevent copy, cut, paste
    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    // 2. Prevent context menu (right click)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // 3. Prevent keyboard shortcuts for inspection and refresh
    const handleKeyDown = (e: KeyboardEvent) => {
      // Refresh keys: F5, Ctrl+R, Ctrl+F5, Ctrl+Shift+R
      if (
        e.key === 'F5' ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'r' || e.key === 'R'))
      ) {
        e.preventDefault();
        return;
      }

      // Dev tools: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
        return;
      }
    };

    // Function to trigger violation safely (throttled)
    const triggerViolation = (reason: string) => {
      const now = Date.now();
      const lastTrigger = (window as any)._lastViolationTime || 0;
      if (now - lastTrigger < 1500) return;
      (window as any)._lastViolationTime = now;

      incrementViolation().then(() => {
        setWarningReason(reason);
        setShowWarningModal(true);
        triggerCallbackRef.current?.(reason);
      });
    };

    // 4. Tab switching/minimize detection via Visibility API
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation('Berpindah tab atau me-minimize jendela browser.');
      }
    };

    // 5. Window blur detection (losing focus)
    const handleWindowBlur = () => {
      triggerViolation('Membuka aplikasi lain atau kehilangan fokus layar kuis.');
    };

    window.addEventListener('copy', handleClipboard);
    window.addEventListener('cut', handleClipboard);
    window.addEventListener('paste', handleClipboard);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('copy', handleClipboard);
      window.removeEventListener('cut', handleClipboard);
      window.removeEventListener('paste', handleClipboard);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [enabled, incrementViolation]);

  return {
    showWarningModal,
    warningReason,
    setShowWarningModal,
  };
};
export default useAntiCheat;
