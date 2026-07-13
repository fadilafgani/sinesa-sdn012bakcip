import { useState, useEffect, useRef } from 'react';

export interface UseFullscreenOptions {
  required?: boolean;
  onExitFullscreen?: () => void;
}

export const useFullscreen = (optionsOrRequired: boolean | UseFullscreenOptions = false) => {
  const options = typeof optionsOrRequired === 'boolean' 
    ? { required: optionsOrRequired } 
    : optionsOrRequired;

  const required = !!options.required;
  const onExitFullscreen = options.onExitFullscreen;
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const onExitFullscreenRef = useRef(onExitFullscreen);

  useEffect(() => {
    onExitFullscreenRef.current = onExitFullscreen;
  }, [onExitFullscreen]);

  useEffect(() => {
    const checkFullscreen = () => {
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      
      setIsFullscreen(isFull);

      if (!isFull && required) {
        onExitFullscreenRef.current?.();
      }
    };

    checkFullscreen();
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
    };
  }, [required]);

  const enterFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.error('Failed to enter fullscreen mode:', err);
    }
  };

  return {
    isFullscreen,
    isFullscreenOverlayActive: required && !isFullscreen,
    enterFullscreen,
  };
};
export default useFullscreen;
