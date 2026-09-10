import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Mobile threads must escape the app shell's clipped scrolling layers.
 * WKWebView's visible height can differ from both 100dvh and the fixed
 * layout viewport, especially while the keyboard is opening or closing.
 */
export function ChatViewport({ children, background }: { children: ReactNode; background: string }) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (!mobile) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      // Do not resize the conversation during pinch zoom.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height ?? window.innerHeight;
      if (height <= 0) return;
      element.style.setProperty("--chat-visible-height", `${height}px`);
      element.style.setProperty("--chat-visible-top", `${viewport?.offsetTop ?? 0}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, [mobile]);

  const content = (
    <div ref={ref} className={`chat-fullscreen${mobile ? " chat-visual-viewport" : ""}`}
      style={{ display: "flex", flexDirection: "column", minHeight: 0, background }}>
      {children}
    </div>
  );
  return mobile ? createPortal(content, document.body) : content;
}