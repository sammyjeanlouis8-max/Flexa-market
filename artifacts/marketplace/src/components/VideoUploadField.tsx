/**
 * CLEAN VIDEO UPLOAD FIELD (Rebuilt)
 *
 * Drop-in component for any form that needs video upload.
 * Used in: Sell page (listingVideoUrl), Boost Wizard (boostVideoUrl).
 *
 * Features:
 *   - Drag-and-drop + click-to-browse
 *   - Real upload progress bar
 *   - Preview of uploaded video
 *   - Clear/remove button
 *   - File type + size validation
 *   - Mobile camera capture support
 *   - Error display
 */
import { useRef, useCallback, useState } from "react";
import { Upload, Video, X, CheckCircle2 } from "lucide-react";
import VideoPlayer from "./VideoPlayer";
import { useVideoUpload, ACCEPTED_VIDEO_TYPES, MAX_VIDEO_SIZE_BYTES } from "@/hooks/use-video-upload";
import { cn } from "@/lib/utils";

interface VideoUploadFieldProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  authToken?: string | null;
  label?: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
}

export default function VideoUploadField({
  value,
  onChange,
  authToken,
  label = "Video",
  hint = "MP4 or MOV · Max 350 MB",
  className,
  disabled = false,
}: VideoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { upload, isUploading, progress, error, reset } = useVideoUpload({
    onSuccess: (result) => onChange(result.url),
    onError: () => {},
  });

  const handleFile = useCallback(
    async (file: File) => {
      if (disabled || isUploading) return;
      await upload(file, authToken);
    },
    [disabled, isUploading, upload, authToken],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleClear = useCallback(() => {
    reset();
    onChange(null);
  }, [reset, onChange]);

  // ── Already has a video — show preview ────────────────────────────────────
  if (value) {
    return (
      <div className={cn("space-y-2", className)}>
        {label && <p className="text-sm font-medium text-foreground">{label}</p>}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <VideoPlayer
            src={value}
            controls
            preload="metadata"
            className="w-full h-full"
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur-sm rounded-full p-1.5 text-white hover:bg-red-600 transition-colors"
              aria-label="Remove video"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-white text-xs font-semibold">Video uploaded</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Uploading ────────────────────────────────────────────────────────────
  if (isUploading) {
    return (
      <div className={cn("space-y-2", className)}>
        {label && <p className="text-sm font-medium text-foreground">{label}</p>}
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-14 h-14">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor"
                  strokeWidth="3" className="text-muted-foreground/20" />
                <circle
                  cx="28" cy="28" r="24"
                  fill="none" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-300"
                  stroke="currentColor"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary">
                {progress}%
              </span>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Uploading…</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {progress < 10
                  ? "Starting upload…"
                  : progress < 95
                  ? "Transferring to Cloudinary…"
                  : "Processing video…"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Drop zone ────────────────────────────────────────────────────────────
  return (
    <div className={cn("space-y-2", className)}>
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload video"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-xl border-2 border-dashed transition-all cursor-pointer",
          "flex flex-col items-center justify-center gap-3 p-8",
          disabled
            ? "opacity-50 cursor-not-allowed border-border"
            : dragOver
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border hover:border-primary/60 hover:bg-muted/40",
        )}
      >
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
          dragOver ? "bg-primary/20" : "bg-muted",
        )}>
          {dragOver ? (
            <Upload className="h-6 w-6 text-primary" />
          ) : (
            <Video className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {dragOver ? "Drop video here" : "Tap to select video"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>

        {/* Mobile: offer camera capture as well */}
        <input
          ref={inputRef}
          type="file"
          accept={[...ACCEPTED_VIDEO_TYPES, "video/*"].join(",")}
          capture={undefined}
          className="sr-only"
          onChange={handleInputChange}
          disabled={disabled}
          aria-hidden="true"
        />
      </div>

      {error && (
        <p className="text-xs text-destructive font-medium flex items-center gap-1.5 px-1">
          <span>⚠</span> {error.message}
        </p>
      )}

      <p className="text-xs text-muted-foreground px-1">
        Max file size: {(MAX_VIDEO_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB
      </p>
    </div>
  );
}
