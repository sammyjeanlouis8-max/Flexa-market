import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface Props {
  latex: string;
  displayMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function MathDisplay({ latex, displayMode = false, className, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        throwOnError: false,
        displayMode,
        strict: "ignore",
      });
    } catch {
      ref.current.textContent = latex;
    }
  }, [latex, displayMode]);

  return <span ref={ref} className={className} style={style} />;
}
