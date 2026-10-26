import React, { useMemo } from 'react';
import katex from 'katex';

export interface LatexRendererProps {
  content?: string | null;
  tex?: string | null; // Backwards-compatible alias for content
  displayMode?: boolean;
  className?: string;
  as?: 'span' | 'div';
}

/**
 * Checks if a string contains LaTeX delimiters or math commands
 */
export function hasLatex(content?: string | null): boolean {
  if (!content || typeof content !== 'string') return false;
  return /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)((?:\\.|[^\\$])+?)\$|\\(frac|sqrt|int|sum|alpha|beta|gamma|theta|pi|partial|mathbf|vec|times|div|pm|mp|le|ge|neq|approx|equiv)\b)/.test(content);
}

/**
 * Parses mixed text content into plain text and LaTeX math tokens
 */
export function parseMixedContent(content?: string | null, forceDisplayMode = false) {
  if (!content || typeof content !== 'string') return [];
  if (!content.trim()) return [];

  // Delimiters supported:
  // 1. $$ ... $$ (display mode)
  // 2. \[ ... \] (display mode)
  // 3. \( ... \) (inline mode)
  // 4. $ ... $   (inline mode, non-empty)
  const delimiterRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)((?:\\.|[^\\$])+?)\$)/g;
  const hasDelimiters = delimiterRegex.test(content);
  delimiterRegex.lastIndex = 0;

  if (!hasDelimiters) {
    if (forceDisplayMode) {
      return [{ type: 'math' as const, value: content.trim(), display: true }];
    }
    // Standalone LaTeX macro without outer delimiters
    if (/^\s*\\(frac|sqrt|int|sum|alpha|beta|gamma|theta|pi|partial|mathbf|vec|times|div|pm|mp|le|ge|neq|approx|equiv)\b/.test(content)) {
      return [{ type: 'math' as const, value: content.trim(), display: false }];
    }
    return [{ type: 'text' as const, value: content }];
  }

  const parts: Array<{ type: 'text' | 'math'; value: string; display?: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiterRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: true });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: true });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      parts.push({ type: 'math', value: token.slice(2, -2).trim(), display: false });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      parts.push({ type: 'math', value: token.slice(1, -1).trim(), display: false });
    }
    lastIndex = delimiterRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}

/**
 * Robust LaTeX and Mixed-Text Math Renderer for SINESA
 * Supports inline \(...\) / $...$, block \[...\] / $$...$$,
 * graceful error recovery, XSS prevention, and responsive wrapping.
 */
export const LatexRenderer: React.FC<LatexRendererProps> = ({
  content,
  tex,
  displayMode = false,
  className = '',
  as
}) => {
  const rawContent = (content !== undefined ? content : tex) ?? '';

  const parsedParts = useMemo(() => {
    return parseMixedContent(rawContent, displayMode);
  }, [rawContent, displayMode]);

  if (!rawContent || parsedParts.length === 0) {
    return null;
  }

  const hasBlockMath = displayMode || parsedParts.some(p => p.type === 'math' && p.display);
  const Tag = as || (hasBlockMath ? 'div' : 'span');

  return (
    <Tag className={`${Tag === 'div' ? 'block' : 'inline'} max-w-full leading-relaxed ${className}`}>
      {parsedParts.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <span key={idx} className="whitespace-pre-wrap">
              {part.value}
            </span>
          );
        }

        // Render Math with KaTeX
        let html = '';
        try {
          html = katex.renderToString(part.value, {
            displayMode: part.display ?? displayMode,
            throwOnError: false,
            trust: false, // Security: disable raw HTML / script execution
            strict: false,
          });
        } catch {
          html = `<span class="katex-error text-destructive font-mono text-xs">${part.value}</span>`;
        }

        if (part.display) {
          return (
            <span
              key={idx}
              className="block my-2 py-1 text-center overflow-x-auto max-w-full font-normal select-text"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="inline-block max-w-full overflow-x-auto align-middle px-0.5 font-normal select-text"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </Tag>
  );
};
