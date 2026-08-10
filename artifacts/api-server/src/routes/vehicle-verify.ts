import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const client  = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

const VEHICLE_LABELS: Record<string, string> = {
  moto:     "motorcycle or motorbike",
  machin:   "car or automobile",
  biyiklèt: "bicycle",
  biyiklet: "bicycle",
};

/**
 * POST /driver/verify-vehicle-photo
 *
 * Fetches an already-uploaded image via its internal URL and runs
 * Claude Vision to confirm it shows the expected vehicle type.
 *
 * Body (JSON):
 *   { imageUrl: string, vehicleType: "moto"|"machin"|"biyiklèt" }
 *
 * Response:
 *   { valid: boolean, reason: string }
 *
 * Note: if AI is unavailable the endpoint returns valid:true so the
 * application is never blocked by a missing API key.
 */
router.post("/driver/verify-vehicle-photo", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { imageUrl, vehicleType } = req.body as { imageUrl?: string; vehicleType?: string };

  if (!imageUrl || !vehicleType) {
    res.status(400).json({ valid: false, reason: "imageUrl and vehicleType are required" });
    return;
  }

  const expectedLabel = VEHICLE_LABELS[vehicleType.toLowerCase()] ?? "vehicle";

  if (!client) {
    req.log?.warn("vehicle-verify: Anthropic not configured — skipping AI check");
    res.json({ valid: true, reason: "AI verification unavailable — admin will review" });
    return;
  }

  try {
    // Build absolute URL to fetch the image
    const host = `http://localhost:${process.env.PORT ?? 8080}`;
    const absoluteUrl = imageUrl.startsWith("http") ? imageUrl : `${host}${imageUrl}`;

    const imgRes = await fetch(absoluteUrl);
    if (!imgRes.ok) {
      req.log?.warn({ imageUrl, status: imgRes.status }, "vehicle-verify: failed to fetch image");
      res.json({ valid: true, reason: "Could not fetch image — admin will review" });
      return;
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const mimeType = allowedTypes.includes(contentType) ? contentType : "image/jpeg";

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `You are a vehicle photo validator for a delivery driver application platform.

The applicant claims this photo shows their ${expectedLabel}.

Answer ONLY with valid JSON, no markdown:
{
  "hasVehicle": true|false,
  "correctType": true|false,
  "isRealPhoto": true|false,
  "reason": "one short sentence explaining your decision (in English)"
}

Rules:
- "hasVehicle": true if the image clearly shows a ${expectedLabel}
- "correctType": true if the vehicle matches the expected type (${expectedLabel})
- "isRealPhoto": true if this looks like a real photo taken by a person (NOT a stock photo, screenshot, cartoon, logo, or downloaded web image)
- If the photo is blurry but you can still identify a ${expectedLabel}, still mark hasVehicle:true
- Be lenient about photo quality but strict about content — the vehicle MUST be clearly visible`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    let parsed: { hasVehicle: boolean; correctType: boolean; isRealPhoto: boolean; reason: string };

    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? text);
    } catch {
      req.log?.warn({ text }, "vehicle-verify: could not parse AI response");
      res.json({ valid: true, reason: "AI parse error — admin will review" });
      return;
    }

    req.log?.info({ vehicleType, hasVehicle: parsed.hasVehicle, correctType: parsed.correctType, isRealPhoto: parsed.isRealPhoto }, "vehicle-verify result");

    if (!parsed.hasVehicle) {
      res.json({ valid: false, reason: `Photo sa a pa montre yon ${vehicleType === "moto" ? "moto" : vehicleType === "machin" ? "machin" : "biyiklèt"}. Tanpri voye yon foto reyèl veyikil ou a.` });
      return;
    }

    if (!parsed.correctType) {
      res.json({ valid: false, reason: `Tip veyikil la pa matche. Aplikasyon ou an pou yon ${vehicleType === "moto" ? "moto" : vehicleType === "machin" ? "machin" : "biyiklèt"} — voye foto ki kòrèk la.` });
      return;
    }

    if (!parsed.isRealPhoto) {
      res.json({ valid: false, reason: "Foto sa a pa sanble yon foto reyèl pris pa ou. Pran foto veyikil ou a dirèkteman ak telefòn ou." });
      return;
    }

    res.json({ valid: true, reason: "Foto veyikil verifye ✓" });
  } catch (err) {
    req.log?.error({ err }, "vehicle-verify: AI error");
    res.json({ valid: true, reason: "AI verification error — admin will review" });
  }
});

export default router;
