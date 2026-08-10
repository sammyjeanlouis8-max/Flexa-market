import { Router, type Request, type Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

const client = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

/**
 * POST /listings/visual-search
 *
 * Accepts a multipart image, uses Claude Vision to identify the product,
 * and returns search keywords + a short description for the marketplace search.
 *
 * Body (multipart/form-data):
 *   image — the photo taken from camera or picked from gallery
 *
 * Response:
 *   { keywords: string, description: string, confidence: "high"|"medium"|"low" }
 */
router.post("/listings/visual-search", requireAuth, upload.single("image"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided. Send the image in a multipart field named 'image'." });
    return;
  }

  if (!client) {
    // Fallback: return empty keywords when AI is not configured
    res.status(503).json({ error: "Visual search is not configured" });
    return;
  }

  const { buffer, mimetype } = req.file;
  const base64Image = buffer.toString("base64");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `You are a product identification assistant for a buy & sell marketplace (like eBay/Facebook Marketplace). 

Look at this image and identify what product or item it shows.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "keywords": "short search phrase (2-5 words, in the same language as the item label if visible, otherwise English)",
  "description": "one sentence describing what you see (in English)",
  "confidence": "high" | "medium" | "low",
  "category": "one of: electronics, clothing, furniture, vehicles, sports, books, toys, jewelry, tools, food, other"
}

Focus on the main product. If it's a person holding something, describe the thing. If you cannot identify any product, return confidence: "low" and keywords: "".`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Parse JSON from Claude's response
    let parsed: { keywords: string; description: string; confidence: string; category: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Claude sometimes wraps in markdown code blocks
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse AI response");
      parsed = JSON.parse(match[0]);
    }

    res.json({
      keywords: (parsed.keywords ?? "").trim(),
      description: (parsed.description ?? "").trim(),
      confidence: parsed.confidence ?? "medium",
      category: parsed.category ?? "other",
    });
  } catch (err) {
    req.log?.error({ err }, "Visual search AI error");
    res.status(500).json({ error: "Failed to analyze image. Please try again." });
  }
});

export default router;
