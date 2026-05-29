import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

export interface MobileSelectOption {
  value: string;
  label: string;
}

export interface MobileSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: MobileSelectOption[];
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

/**
 * A smart select that adapts to the device:
 * - Mobile / touch → native <select> (no scroll jumping, perfect OS picker)
 * - Desktop / mouse → Radix UI Select (styled dropdown)
 *
 * iOS Safari scroll-jump fix:
 *   1. font-size >= 16px prevents viewport zoom on focus (primary fix)
 *   2. Scroll position is saved on touchstart/focus and restored after
 *      onChange via requestAnimationFrame, as a safety net for any
 *      residual reflow-triggered scroll.
 */
export function MobileSelect({
  value,
  onValueChange,
  placeholder,
  options,
  className,
  disabled,
  "data-testid": dataTestId,
}: MobileSelectProps) {
  const isMobile = useIsMobile();
  const savedScrollY = React.useRef<number>(0);

  const saveScroll = () => {
    savedScrollY.current = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };

  const restoreScroll = () => {
    const y = savedScrollY.current;
    if (y === 0) return;
    requestAnimationFrame(() => {
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
    });
  };

  if (isMobile) {
    return (
      <div className="relative w-full">
        <select
          value={value ?? ""}
          disabled={disabled}
          data-testid={dataTestId}
          onTouchStart={saveScroll}
          onFocus={saveScroll}
          onChange={(e) => {
            e.stopPropagation();
            onValueChange?.(e.target.value);
            restoreScroll();
          }}
          className={cn(
            "h-11 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9",
            "text-foreground shadow-sm",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[color-scheme:light] dark:[color-scheme:dark]",
            className
          )}
          style={{ WebkitAppearance: "none", fontSize: "16px" }}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9", className)} data-testid={dataTestId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
