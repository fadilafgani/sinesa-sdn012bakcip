import React, { useEffect, useRef } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  tex: string;
  displayMode?: boolean;
  className?: string;
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({ tex, displayMode = false, className = '' }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(tex, containerRef.current, {
          displayMode,
          throwOnError: false,
          trust: true,
        });
      } catch (err) {
        console.error('KaTeX rendering error:', err);
      }
    }
  }, [tex, displayMode]);

  return <span ref={containerRef} className={className} />;
};
