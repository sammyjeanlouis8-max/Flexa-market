import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { Smile, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Categories } from "emoji-picker-react";

// Lazy-load the picker so it's never part of the initial bundle.
// It's only downloaded the first time the user clicks the emoji button.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface Props {
  onEmojiSelect: (emoji: string) => void;
  /** Which side of the button the picker anchors to (default: left) */
  align?: "left" | "right";
  className?: string;
  /** Extra classes applied directly to the trigger button (e.g. override color) */
  buttonClassName?: string;
}

/**
 * A 😊 button that opens a lazy-loaded emoji picker above itself.
 * Closes on outside click, Escape key, or after an emoji is selected.
 *
 * Usage:
 *   <EmojiPickerButton onEmojiSelect={(e) => setText(t => t + e)} />
 *
 * For cursor-aware insertion use `insertEmojiAtCursor` helper below.
 */
export function EmojiPickerButton({ onEmojiSelect, align = "left", className, buttonClassName }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = useCallback((emojiData: { emoji: string }) => {
    onEmojiSelect(emojiData.emoji);
    setOpen(false);
  }, [onEmojiSelect]);

  return (
    <div ref={containerRef} className={cn("relative flex-shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          open && "bg-accent text-foreground",
          buttonClassName,
        )}
        aria-label="Emoji picker"
        title="Emoji"
      >
        <Smile className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-[70] bottom-full mb-2",
            align === "right" ? "right-0" : "left-0",
            // On very small screens centre the picker horizontally
            "max-[360px]:fixed max-[360px]:inset-x-2 max-[360px]:bottom-[72px]",
          )}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card shadow-xl" style={{ width: 300, height: 380 }}>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <EmojiPicker
              onEmojiClick={handleSelect}
              searchPlaceholder="Chache emoji…"
              width={300}
              height={380}
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              categories={[
                { category: Categories.SUGGESTED,      name: "🔥 Popular"  },
                { category: Categories.SMILEYS_PEOPLE, name: "😀 Smileys"  },
                { category: Categories.ANIMALS_NATURE, name: "🐼 Animals"  },
                { category: Categories.FOOD_DRINK,     name: "🍔 Food"     },
                { category: Categories.ACTIVITIES,     name: "🎉 Events"   },
                { category: Categories.OBJECTS,        name: "💡 Objects"  },
                { category: Categories.SYMBOLS,        name: "❤️ Symbols"  },
              ]}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/**
 * Inserts `emoji` at the current cursor position inside a textarea or input
 * and returns the resulting string. Restores focus + cursor after React re-renders.
 *
 * Usage:
 *   onEmojiSelect={(emoji) =>
 *     setText(insertEmojiAtCursor(textareaRef.current, text, emoji))
 *   }
 */
export function insertEmojiAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  currentValue: string,
  emoji: string,
): string {
  if (!el) return currentValue + emoji;
  const start = el.selectionStart ?? currentValue.length;
  const end   = el.selectionEnd   ?? currentValue.length;
  const next  = currentValue.slice(0, start) + emoji + currentValue.slice(end);
  // Restore cursor after React flushes the state update
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + emoji.length, start + emoji.length);
  });
  return next;
}
