import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/storage", () => ({
  uploadToStorage: vi.fn(async () => ({ url: "https://cdn.example/evidence.jpg", backend: "wasabi" })),
}));

vi.mock("../lib/s3", () => ({
  extractWasabiKey: vi.fn(() => null),
  getWasabiObject: vi.fn(),
}));

const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const execFileMock = vi.fn();
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: (...args: any[]) => execFileMock(...args),
  };
});

function visionReply(payload: Record<string, unknown>) {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe("mediaModeration — photo categories", () => {
  beforeEach(() => {
    createMock.mockReset();
    execFileMock.mockReset();
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.test/v1";
  });

  it("auto-rejects confirmed intimate exposure", async () => {
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    visionReply({
      decision: "rejected",
      category: "intimate_exposure",
      confidence: 0.94,
      reason: "Clear genital exposure",
      contextNote: null,
    });
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    expect(result.decision).toBe("rejected");
    expect(result.category).toBe("intimate_exposure");
    expect(result.formalReason).toMatch(/intimate/i);
  });

  it("auto-rejects confirmed explicit sexual act", async () => {
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    visionReply({
      decision: "rejected",
      category: "explicit_sexual",
      confidence: 0.91,
      reason: "Explicit sexual act visible",
      contextNote: null,
    });
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    expect(result.decision).toBe("rejected");
    expect(result.category).toBe("explicit_sexual");
  });

  it("auto-rejects confirmed firearm", async () => {
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    visionReply({
      decision: "rejected",
      category: "firearm",
      confidence: 0.88,
      reason: "Real handgun clearly visible",
      contextNote: null,
    });
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    expect(result.decision).toBe("rejected");
    expect(result.category).toBe("firearm");
  });

  it("sends underwear / swimwear misclassification to human review", async () => {
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    visionReply({
      decision: "pending",
      category: "intimate_exposure",
      confidence: 0.55,
      reason: "Underwear only — not confirmed intimate exposure",
      contextNote: "swimwear_or_underwear",
    });
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    expect(result.decision).toBe("pending");
    expect(result.category).toBe("intimate_exposure");
  });

  it("does not auto-reject low-confidence AI reject", async () => {
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    visionReply({
      decision: "rejected",
      category: "firearm",
      confidence: 0.4,
      reason: "Object resembles a gun",
      contextNote: "toy_like",
    });
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    expect(result.decision).toBe("pending");
  });

  it("stays pending when analysis service is unavailable", async () => {
    const prev = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const { moderateImageBuffer } = await import("../lib/mediaModeration");
    const result = await moderateImageBuffer(Buffer.from("fake-jpeg"));
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = prev;
    expect(result.decision).toBe("pending");
    expect(result.source).toBe("rules_fallback");
  });
});

describe("mediaModeration — video mid-frame violation", () => {
  beforeEach(() => {
    createMock.mockReset();
    execFileMock.mockReset();
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.test/v1";
  });

  it("rejects when a later extracted frame confirms a firearm", async () => {
    execFileMock.mockImplementation((_bin: string, args: string[], optsOrCb: any, maybeCb?: any) => {
      const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
      void (async () => {
        try {
          const outPattern = args[args.length - 1] as string;
          const dir = outPattern.replace(/frame-%05d\.jpg$/, "");
          await fs.writeFile(`${dir}frame-00001.jpg`, Buffer.from("frame-a"));
          await fs.writeFile(`${dir}frame-00002.jpg`, Buffer.from("frame-b"));
          await fs.writeFile(`${dir}frame-00003.jpg`, Buffer.from("frame-c"));
          cb(null, { stdout: "", stderr: "" });
        } catch (err) {
          cb(err);
        }
      })();
    });

    // fps=1 → timestamps 0,1,2 — reject on third frame
    visionReply({ decision: "approved", category: null, confidence: 0.9, reason: "ok", contextNote: null });
    visionReply({ decision: "approved", category: null, confidence: 0.85, reason: "ok", contextNote: null });
    visionReply({
      decision: "rejected",
      category: "firearm",
      confidence: 0.93,
      reason: "Rifle visible late in clip",
      contextNote: null,
    });

    const { moderateVideoBuffer } = await import("../lib/mediaModeration");
    const result = await moderateVideoBuffer(Buffer.from("fake-video-bytes"));
    expect(result.decision).toBe("rejected");
    expect(result.category).toBe("firearm");
    expect(result.evidenceTimestampSec).toBe(2);
    expect(result.findings.length).toBe(3);
  });

  it("frame extraction failure stays pending (never auto-reject)", async () => {
    execFileMock.mockImplementation((_bin: string, _args: string[], optsOrCb: any, maybeCb?: any) => {
      const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
      cb(new Error("ffmpeg missing"));
    });
    const { moderateVideoBuffer } = await import("../lib/mediaModeration");
    const result = await moderateVideoBuffer(Buffer.from("fake-video"));
    expect(result.decision).toBe("pending");
    expect(result.source).toBe("rules_fallback");
  });
});

describe("mediaModeration — helpers", () => {
  it("formats timestamps", async () => {
    const { formatTimestamp } = await import("../lib/mediaModeration");
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(125.9)).toBe("2:05");
  });
});
