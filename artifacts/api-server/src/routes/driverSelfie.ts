import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes, randomUUID } from "crypto";
import multer from "multer";
import { validateMimeType } from "../lib/s3";
import { ObjectStorageService } from "../lib/objectStorage";
import { extractToken, verifyToken } from "../lib/auth";
import { logger } from "../lib/logger";

// ── In-memory session store (no DB — sessions expire in 10 min) ───────────────
interface SelfieSession {
  userId: number;
  sessionToken: string; // random secret included in QR URL — mobile auth
  completed: boolean;
  photoUrl?: string;
  createdAt: number;
}

const sessions = new Map<string, SelfieSession>();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Prune expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /driver/selfie-session
// Creates a new selfie session for the authenticated (desktop) user.
// Returns: { sessionId, mobileUrl }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/driver/selfie-session", async (req: Request, res: Response): Promise<void> => {
  const token = extractToken(req.headers.authorization);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }

  const sessionId = randomBytes(16).toString("hex");
  const sessionToken = randomBytes(32).toString("hex");

  sessions.set(sessionId, {
    userId: payload.userId,
    sessionToken,
    completed: false,
    createdAt: Date.now(),
  });

  // Build mobile URL using the public domain
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const primaryDomain = domains.split(",")[0]?.trim() ?? (req.get("host") ?? "localhost");
  const mobileUrl = `https://${primaryDomain}/driver-selfie?sid=${sessionId}&st=${sessionToken}`;

  req.log.info({ sessionId, userId: payload.userId }, "Selfie session created");
  res.json({ sessionId, mobileUrl });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /driver/selfie-session/:id
// Polls session status. Called by the desktop every 3 s.
// Returns: { completed, photoUrl }
// ─────────────────────────────────────────────────────────────────────────────
router.get("/driver/selfie-session/:id", async (req: Request, res: Response): Promise<void> => {
  const token = extractToken(req.headers.authorization);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }

  const id = req.params["id"] ?? "";
  const session = sessions.get(id);

  if (!session || session.userId !== payload.userId) {
    res.status(404).json({ error: "Session not found" }); return;
  }
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    res.status(410).json({ error: "Session expired" }); return;
  }

  res.json({ completed: session.completed, photoUrl: session.photoUrl ?? null });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /driver/selfie-session/:id/complete
// Called by the MOBILE page to upload the selfie photo.
// Auth: session token in form field "st" (no JWT required — mobile may not be logged in).
// Body (multipart): file + st
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/driver/selfie-session/:id/complete",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params["id"] ?? "";
    const body = req.body as Record<string, string>;
    const sessionToken = body["st"] ?? (req.headers["x-session-token"] as string | undefined) ?? "";

    const session = sessions.get(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.sessionToken !== sessionToken) { res.status(403).json({ error: "Invalid session token" }); return; }
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      res.status(410).json({ error: "Session expired" }); return;
    }
    // Idempotent — if already completed, just return existing URL
    if (session.completed) {
      res.json({ ok: true, photoUrl: session.photoUrl });
      return;
    }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    try {
      validateMimeType(file.mimetype);

      const objectId = randomUUID();
      await objectStorage.uploadBufferById(objectId, file.buffer, file.mimetype);
      const photoUrl = `/api/storage/objects/uploads/${objectId}`;
      session.completed = true;
      session.photoUrl = photoUrl;

      req.log.info({ sessionId }, "Selfie session completed via mobile");
      res.json({ ok: true, photoUrl });
    } catch (err) {
      logger.error({ err }, "Selfie session mobile upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
