import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { validateMimeType } from "../lib/s3";
import { uploadToStorage } from "../lib/storage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

const imageFallbackUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed."));
      return;
    }
    callback(null, true);
  },
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
router.post("/upload", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided. Send the file in a multipart field named 'file'." });
    return;
  }

  const { buffer, mimetype } = req.file;

  try {
    validateMimeType(mimetype);
    const { url, backend } = await uploadToStorage(buffer, mimetype);
    req.log.info({ mimetype, url, backend }, "Multipart upload complete");
    res.status(201).json({ url });
  } catch (err: any) {
    req.log.error({ err }, "Object storage multipart upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

router.post(
  "/storage/uploads/image-fallback",
  requireAuth,
  imageFallbackUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No image provided." });
      return;
    }

    const { buffer, mimetype } = req.file;
    try {
      validateMimeType(mimetype);
      const { url, backend } = await uploadToStorage(buffer, mimetype);
      req.log.info({ mimetype, url, backend }, "Image fallback upload complete");
      res.status(201).json({ url });
    } catch (err: any) {
      req.log.error({ err }, "Image fallback upload failed");
      const msg: string = err?.message ?? "Image upload failed";
      const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

export default router;
