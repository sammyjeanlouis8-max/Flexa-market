import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import {
  mkdirSync, createWriteStream, createReadStream,
  existsSync, rmSync, writeFileSync, readFileSync,
} from "fs";
import { join } from "path";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType, uploadBufferToWasabi, isWasabiConfigured } from "../lib/s3";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// Detect when CLOUDINARY_CLOUD_NAME is set to the Replit Object Storage bucket ID
// instead of the actual Cloudinary cloud name (a common misconfiguration on Render).
// The bucket IDs look like: "mediaflows_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
const rawCloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
const KNOWN_CLOUD_NAME = "dvkbgodbk"; // appears in every public Cloudinary URL
const cloudName = rawCloudName && !rawCloudName.includes("-") && rawCloudName.length < 32
  ? rawCloudName           // looks like a real Cloudinary slug (short, no dashes)
  : KNOWN_CLOUD_NAME;      // missing, UUID-shaped, or bucket-ID-shaped → use known good value

// Storage priority: Cloudinary > Wasabi > GCS/PRIVATE_OBJECT_DIR
// Set CLOUDINARY_API_KEY for Cloudinary, or WASABI_ACCESS_KEY_ID + WASABI_SECRET_ACCESS_KEY
// + WASABI_BUCKET_NAME for Wasabi, or PRIVATE_OBJECT_DIR for Replit GCS storage.
const USE_CLOUDINARY = !!(process.env["CLOUDINARY_API_KEY"]);
const USE_WASABI     = !USE_CLOUDINARY && isWasabiConfigured();

if (USE_CLOUDINARY) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    process.env["CLOUDINARY_API_KEY"],
    api_secret: process.env["CLOUDINARY_API_SECRET"],
  });
}

async function uploadBufferToCloudinary(buffer: Buffer, contentType: string): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty file received — please select a valid image and try again.");
  }
  const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
  const resourceType = isVideo ? "video" : "image";
  // Force JPEG output for images so HEIC/HEIF (iPhone default format) is always
  // converted to a widely-supported format before storage.
  const uploadOptions: Record<string, unknown> = { resource_type: resourceType, folder: "flexa-market" };
  if (!isVideo) uploadOptions["format"] = "jpg";
  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  try {
    const token = randomUUID();
    const uploadURL  = `/api/storage/uploads/put-proxy/${token}`;
    const objectPath = `/objects/uploads/${token}`;

    res.json(
      RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

const MAX_UPLOAD_BYTES = 350 * 1024 * 1024;

router.put("/storage/uploads/put-proxy/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"]);
  // Normalize: strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
  const rawContentType = (req.headers["content-type"] ?? "application/octet-stream") as string;
  const contentType = rawContentType.split(";")[0].trim() as string;

  try {
    validateMimeType(contentType);

    const clHeader = req.headers["content-length"];
    if (clHeader && parseInt(clHeader, 10) > MAX_UPLOAD_BYTES) {
      req.resume();
      res.status(400).json({ error: "File too large. Maximum video size is 350 MB." });
      return;
    }

    // ── 1. Cloudinary ────────────────────────────────────────────────────────
    if (USE_CLOUDINARY) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);
      const url = await uploadBufferToCloudinary(buffer, contentType);
      req.log.info({ token, url }, "Cloudinary upload complete");
      res.status(200).json({ url });
      return;
    }

    // ── 2. Wasabi (S3-compatible) ─────────────────────────────────────────────
    // Set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET_NAME
    // (and optionally WASABI_REGION, WASABI_ENDPOINT) on your server.
    if (USE_WASABI) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);
      const url = await uploadBufferToWasabi(buffer, contentType);
      req.log.info({ token, url }, "Wasabi upload complete");
      res.status(200).json({ url });
      return;
    }

    // ── 3. Replit GCS / local PRIVATE_OBJECT_DIR ─────────────────────────────
    if (!process.env["PRIVATE_OBJECT_DIR"]) {
      req.resume();
      req.log.error({ token }, "Upload failed: no storage configured. Set WASABI_ACCESS_KEY_ID + WASABI_SECRET_ACCESS_KEY + WASABI_BUCKET_NAME (or CLOUDINARY_API_KEY, or PRIVATE_OBJECT_DIR).");
      res.status(503).json({ error: "Storage not configured on this server. Add WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, and WASABI_BUCKET_NAME environment variables." });
      return;
    }

    const objectPath = await objectStorage.uploadStreamById(token, req, contentType);
    req.log.info({ token, objectPath }, "GCS stream upload via proxy complete");
    res.status(200).json({});
  } catch (err: any) {
    req.log.error({ err, token }, "Proxy upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});
