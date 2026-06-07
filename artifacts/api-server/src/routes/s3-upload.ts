import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { validateMimeType } from "../lib/s3";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

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
 * AUTH: requires a valid Bearer JWT. The endpoint previously accepted
 * anonymous uploads, allowing unbounded storage abuse, hosting of illegal
 * content under the platform domain, and Node-process memory exhaustion
 * (multer.memoryStorage at 300 MB per request). Authentication binds every
 * uploaded object to a known user id (visible via req.log) which both
 * provides accountability and lets downstream quotas/rate-limits work.
 *
 * Body (multipart/form-data):
 *   file  — the image, video, or audio file
 *
 * Response:
 *   { url }  — /objects/uploads/<id> path served by the objects proxy
 */
router.post("/upload", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided. Send the file in a multipart field named 'file'." });
    return;
  }

  const { buffer, mimetype } = req.file;

  try {
    validateMimeType(mimetype);
    const objectId = randomUUID();
    await objectStorage.uploadBufferById(objectId, buffer, mimetype);
    const url = `/api/storage/objects/uploads/${objectId}`;
    req.log.info({ mimetype, url, userId: req.userId, size: buffer.length }, "Multipart upload to object storage complete");
    res.status(201).json({ url });
  } catch (err: any) {
    req.log.error({ err, userId: req.userId }, "Object storage multipart upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
