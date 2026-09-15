import { useState, useCallback } from "react";
import type { UppyFile } from "@uppy/core";

/**
 * Convert any image File to JPEG using the browser Canvas API.
 * This runs entirely client-side so the server always receives valid JPEG
 * data regardless of what format the device originally produced (HEIC/HEIF,
 * BMP, TIFF, WebP, PNG, GIF, etc.).
 *
 * Falls back to the original file on any error so uploads are never blocked.
 */
async function convertImageToJpeg(file: File): Promise<File> {
  // Videos, audio, and already-JPEG images skip conversion.
  if (!file.type.startsWith("image/") || file.type === "image/jpeg") return file;
  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const jpegName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
              resolve(new File([blob], jpegName, { type: "image/jpeg", lastModified: file.lastModified }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.92,
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  /** Base path where object storage routes are mounted (default: "/api/storage") */
  basePath?: string;
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
  /** Preserve the legacy null-on-error behavior unless a caller needs exact errors. */
  throwOnError?: boolean;
}

class UploadHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UploadHttpError";
  }
}

/**
 * React hook for handling file uploads with presigned URLs.
 *
 * This hook implements the two-step presigned URL upload flow:
 * 1. Request a presigned URL from your backend (sends JSON metadata, NOT the file)
 * 2. Upload the file directly to the presigned URL
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const { uploadFile, isUploading, error } = useUpload({
 *     onSuccess: (response) => {
 *       console.log("Uploaded to:", response.objectPath);
 *     },
 *   });
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       await uploadFile(file);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={isUploading} />
 *       {isUploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const token = typeof window !== "undefined"
        ? (window.localStorage.getItem("flexamarket_token") ?? window.sessionStorage.getItem("flexamarket_token"))
        : null;
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new UploadHttpError(
          errorData.error || `Failed to get upload URL (HTTP ${response.status})`,
          response.status,
        );
      }

      return response.json();
    },
    []
  );

  const uploadToPresignedUrl = useCallback(
    async (file: File, uploadURL: string, originalObjectPath: string): Promise<string> => {
      const token = typeof window !== "undefined"
        ? (window.localStorage.getItem("flexamarket_token") ?? window.sessionStorage.getItem("flexamarket_token"))
        : null;
      const response = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new UploadHttpError(
          errorData.error || `Failed to upload file to storage (HTTP ${response.status})`,
          response.status,
        );
      }

      // The upload proxy returns the final storage URL. It may be an absolute
      // CDN URL or the same-origin Wasabi proxy path; both must replace the
      // one-time /objects/uploads/TOKEN placeholder.
      try {
        const data = await response.json();
        if (
          typeof data?.url === "string" &&
          (data.url.startsWith("http://") ||
            data.url.startsWith("https://") ||
            data.url.startsWith("/"))
        ) {
          return data.url;
        }
      } catch {
        // Non-JSON response (e.g. raw GCS PUT) — fall back to objectPath
      }
      return originalObjectPath;
    },
    []
  );

  const uploadMultipartFallback = useCallback(
    async (file: File): Promise<string> => {
      const token = typeof window !== "undefined"
        ? (window.localStorage.getItem("flexamarket_token") ?? window.sessionStorage.getItem("flexamarket_token"))
        : null;
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await fetch("/api/storage/uploads/image-fallback", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new UploadHttpError(
          errorData.error || `Upload failed (HTTP ${response.status})`,
          response.status,
        );
      }
      const data = await response.json();
      if (typeof data?.url !== "string" || !data.url) {
        throw new Error("Upload completed without a usable image URL");
      }
      return data.url;
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        // Convert non-JPEG images (including HEIC from iPhone) to JPEG
        // before uploading so the server always receives a valid format.
        const convertedFile = await convertImageToJpeg(file);

        setProgress(10);
        let uploadResponse: UploadResponse | null = null;
        let resolvedPath: string;
        const fallbackEligible =
          convertedFile.type.startsWith("image/") &&
          convertedFile.size <= 10 * 1024 * 1024;
        const useImageFallback = async (primaryError: unknown): Promise<string> => {
          if (!fallbackEligible) throw primaryError;
          try {
            return await uploadMultipartFallback(convertedFile);
          } catch (fallbackError) {
            const primaryMessage = primaryError instanceof Error ? primaryError.message : "Primary upload failed";
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback upload failed";
            throw new Error(`${primaryMessage}. ${fallbackMessage}`);
          }
        };

        try {
          uploadResponse = await requestUploadUrl(convertedFile);
        } catch (presignError) {
          // A failed presign request cannot have stored the file, so all
          // transport and HTTP failures may safely use the bounded fallback.
          resolvedPath = await useImageFallback(presignError);
        }

        if (uploadResponse) {
          setProgress(30);
          try {
            resolvedPath = await uploadToPresignedUrl(
              convertedFile,
              uploadResponse.uploadURL,
              uploadResponse.objectPath
            );
          } catch (putError) {
            // A non-2xx response proves the PUT was rejected. A thrown network
            // error is ambiguous (the file may have committed), so do not
            // retry it through another endpoint and create an orphan duplicate.
            if (!(putError instanceof UploadHttpError)) throw putError;
            resolvedPath = await useImageFallback(putError);
          }
        }

        const finalResponse: UploadResponse = {
          ...(uploadResponse ?? {
            uploadURL: "/api/storage/uploads/image-fallback",
            objectPath: resolvedPath,
            metadata: {
              name: convertedFile.name,
              size: convertedFile.size,
              contentType: convertedFile.type || "application/octet-stream",
            },
          }),
          objectPath: resolvedPath,
        };

        setProgress(100);
        options.onSuccess?.(finalResponse);
        return finalResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        options.onError?.(error);
        if (options.throwOnError) throw error;
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, uploadMultipartFallback, options]
  );

  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const data = await response.json();
      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    []
  );

  return {
    uploadFile,
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}
