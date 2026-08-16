import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { validateMimeType } from "../lib/s3";
import { ObjectStorageService } from "../lib/objectStorage";
import { isConfigured as wasabiConfigured, uploadMedia as wasabiUploadMedia } from "../lib/wasabi";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

/**
 * POST /upload
 *
 * Multipart upload: accepts a file field named "file", stores it in
 * Replit Object Storage, and returns the canonical object path.
 *
 * Body (multipart/form-data):
 *   file  — the image, video, or audio file
 *
 * Response:
 *   { url }  — /objects/uploads/<id> path served by the objects proxy
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided. Send the file in a multipart field named 'file'." });
    return;
  }

  const { buffer, mimetype } = req.file;

  try {
    validateMimeType(mimetype);
    // Production (DigitalOcean) has no Replit Object Storage sidecar — use
    // Wasabi whenever it is configured; fall back to Replit storage in dev.
    if (wasabiConfigured()) {
      const { url } = await wasabiUploadMedia(buffer, mimetype);
      req.log.info({ mimetype, url }, "Multipart upload to Wasabi complete");
      res.status(201).json({ url });
      return;
    }
    const objectId = randomUUID();
    await objectStorage.uploadBufferById(objectId, buffer, mimetype);
    const url = `/api/storage/objects/uploads/${objectId}`;
    req.log.info({ mimetype, url }, "Multipart upload to object storage complete");
    res.status(201).json({ url });
  } catch (err: any) {
    req.log.error({ err }, "Object storage multipart upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
