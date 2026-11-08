import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  maxHeight?: number;
  "data-testid"?: string;
};

/**
 * Adaptive image frame that preserves intrinsic aspect ratio without
 * layout-generated black bars, stretch, or forced cropping.
 */
export function AdaptiveImage({
  src,
  alt = "",
  className,
  maxHeight = 360,
  "data-testid": testId = "adaptive-image",
}: Props) {
  const [ratio, setRatio] = useState(1);

  return (
    <div
      className={cn("ai-shell", className)}
      data-testid={testId}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            setRatio(el.naturalWidth / el.naturalHeight);
          }
        }}
        style={{
          aspectRatio: String(ratio),
          maxHeight: `${maxHeight}px`,
          width: `min(100%, ${maxHeight * ratio}px)`,
          maxWidth: "100%",
          height: "auto",
          objectFit: "contain",
          display: "block",
          borderRadius: 14,
          background: "transparent",
        }}
      />
    </div>
  );
}
