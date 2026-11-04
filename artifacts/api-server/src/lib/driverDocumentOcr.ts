/**
 * AI-assisted OCR for Haiti driver identity documents (CIN + permis).
 * Uses Anthropic vision when configured; otherwise returns aiAvailable:false.
 *
 * Never logs raw OCR text or document contents — only structured flags/scores.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  decideDriverVerification,
  outcomeToApplicationStatus,
  type DocQualityFlag,
  type VerificationDecision,
} from "./driverIdVerification";
import { logger } from "./logger";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const client = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

export interface DocOcrResult {
  extractedName: string | null;
  quality: DocQualityFlag[];
  documentLooksComplete: boolean;
}

export interface DriverAiVerificationBundle {
  decision: VerificationDecision;
  nextStatus: string;
  cin: DocOcrResult | null;
  license: DocOcrResult | null;
  /** Safe JSON for DB — no full OCR dumps. */
  storedResult: Record<string, unknown>;
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const host = `http://localhost:${process.env.PORT ?? 8080}`;
    const absoluteUrl = imageUrl.startsWith("http")
      ? imageUrl
      : imageUrl.startsWith("didoc:")
        ? null // private refs resolved by caller before OCR
        : `${host}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
    if (!absoluteUrl) return null;

    const imgRes = await fetch(absoluteUrl);
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const mime = allowed.includes(contentType) ? contentType : "image/jpeg";
    const buf = Buffer.from(await imgRes.arrayBuffer());
    // Extremely small buffers are almost certainly unreadable / incomplete.
    if (buf.byteLength < 8_000) {
      return { base64: buf.toString("base64"), mime };
    }
    return { base64: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

async function ocrOneDocument(
  imageUrl: string,
  kind: "cin" | "license",
): Promise<DocOcrResult> {
  if (!client) {
    return { extractedName: null, quality: ["ai_unavailable"], documentLooksComplete: false };
  }

  const img = await fetchImageAsBase64(imageUrl);
  if (!img) {
    return { extractedName: null, quality: ["unreadable"], documentLooksComplete: false };
  }
  if (Buffer.from(img.base64, "base64").byteLength < 8_000) {
    return { extractedName: null, quality: ["incomplete", "unreadable"], documentLooksComplete: false };
  }

  const label = kind === "cin"
    ? "Haitian National Identification Card (CIN / carte d'identité nationale)"
    : "Haitian driving license (permis de conduire)";

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
                media_type: img.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: img.base64,
              },
            },
            {
              type: "text",
              text: `You verify identity documents for Flexa Market motorcycle drivers in Haiti.

This image should be a ${label}.

Return ONLY valid JSON (no markdown):
{
  "isCorrectDocumentType": true|false,
  "isBlurry": true|false,
  "isReadable": true|false,
  "looksComplete": true|false,
  "extractedFullName": "string or empty if unreadable",
  "reason": "short English note"
}

Rules:
- extractedFullName: legal name as printed (given + family). Empty if unreadable.
- Be lenient on lighting/angle; mark isBlurry only when text cannot be read.
- looksComplete=false if corners/text cut off or document partially missing.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    let parsed: {
      isCorrectDocumentType?: boolean;
      isBlurry?: boolean;
      isReadable?: boolean;
      looksComplete?: boolean;
      extractedFullName?: string;
    };
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? text);
    } catch {
      logger.warn({ kind }, "driver-doc-ocr: parse failure — human review");
      return { extractedName: null, quality: ["ai_unavailable"], documentLooksComplete: false };
    }

    const quality: DocQualityFlag[] = [];
    if (parsed.isBlurry) quality.push("blurry");
    if (parsed.isReadable === false) quality.push("unreadable");
    if (parsed.looksComplete === false || parsed.isCorrectDocumentType === false) quality.push("incomplete");

    const name = String(parsed.extractedFullName ?? "").trim();
    // Never log the extracted name or OCR body.
    logger.info({
      kind,
      hasName: name.length > 0,
      quality,
      complete: parsed.looksComplete === true,
    }, "driver-doc-ocr result");

    return {
      extractedName: name || null,
      quality,
      documentLooksComplete: parsed.looksComplete === true && parsed.isCorrectDocumentType !== false,
    };
  } catch (err) {
    logger.error({ err: (err as Error)?.message, kind }, "driver-doc-ocr AI error");
    return { extractedName: null, quality: ["ai_unavailable"], documentLooksComplete: false };
  }
}

/**
 * Run CIN + license OCR and produce a verification decision.
 * image URLs must be fetchable by the server (public or localhost proxy).
 */
export async function runDriverIdentityVerification(opts: {
  registeredFullName: string;
  cinImageUrl: string | null | undefined;
  licenseImageUrl: string | null | undefined;
}): Promise<DriverAiVerificationBundle> {
  const aiAvailable = !!client;
  const cin = opts.cinImageUrl
    ? await ocrOneDocument(opts.cinImageUrl, "cin")
    : { extractedName: null, quality: ["missing_document"] as DocQualityFlag[], documentLooksComplete: false };
  const license = opts.licenseImageUrl
    ? await ocrOneDocument(opts.licenseImageUrl, "license")
    : { extractedName: null, quality: ["missing_document"] as DocQualityFlag[], documentLooksComplete: false };

  const decision = decideDriverVerification({
    registeredFullName: opts.registeredFullName,
    cinExtractedName: cin.extractedName,
    licenseExtractedName: license.extractedName,
    cinQuality: cin.quality,
    licenseQuality: license.quality,
    aiAvailable,
  });

  const nextStatus = outcomeToApplicationStatus(decision.outcome);

  const storedResult: Record<string, unknown> = {
    version: 1,
    at: new Date().toISOString(),
    outcome: decision.outcome,
    nextStatus,
    flags: decision.flags,
    summary: decision.summary,
    adminNotes: decision.adminNotes,
    cin: {
      hasName: !!cin.extractedName,
      // Store extracted names for admin review panel only (not application logs).
      extractedName: cin.extractedName,
      quality: cin.quality,
      complete: cin.documentLooksComplete,
      matchScore: decision.cinMatch?.score ?? null,
      significantMismatch: decision.cinMatch?.significantMismatch ?? null,
      minorDiff: decision.cinMatch?.minorDiff ?? null,
    },
    license: {
      hasName: !!license.extractedName,
      extractedName: license.extractedName,
      quality: license.quality,
      complete: license.documentLooksComplete,
      matchScore: decision.licenseMatch?.score ?? null,
      significantMismatch: decision.licenseMatch?.significantMismatch ?? null,
      minorDiff: decision.licenseMatch?.minorDiff ?? null,
    },
    crossDoc: decision.crossDocMatch
      ? {
          matchScore: decision.crossDocMatch.score,
          significantMismatch: decision.crossDocMatch.significantMismatch,
          minorDiff: decision.crossDocMatch.minorDiff,
        }
      : null,
    finalApprovalRequired: true,
  };

  return { decision, nextStatus, cin, license, storedResult };
}
