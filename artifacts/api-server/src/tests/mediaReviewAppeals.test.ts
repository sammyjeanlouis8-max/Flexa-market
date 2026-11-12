import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/flexa_test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-for-media-reviews";

vi.mock("../middlewares/auth", () => ({
  hasRole: () => false,
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireModerator: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })) })),
  },
  mediaReviewsTable: {},
  notificationsTable: {},
  usersTable: {},
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/mediaModeration", () => ({
  blurEvidenceApprox: vi.fn(),
  formatTimestamp: (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  },
  moderateMediaFromUrl: vi.fn(),
  storeEvidenceImage: vi.fn(),
}));

describe("media review appeal eligibility", () => {
  let serializeMediaReview: typeof import("../lib/mediaReviewService").serializeMediaReview;

  beforeAll(async () => {
    ({ serializeMediaReview } = await import("../lib/mediaReviewService"));
  });

  function baseRow(over: Record<string, unknown> = {}) {
    const now = new Date();
    return {
      id: 1,
      ownerId: 10,
      scope: "boost_video",
      entityId: 99,
      assetUrl: "/api/storage/wasabi-image?key=uploads/videos/a.mp4",
      contentSha256: null,
      mediaType: "video",
      status: "rejected",
      progressStep: 2,
      progressLabel: "verification",
      violationCategory: "intimate_exposure",
      formalReason: "Exposed intimate body parts detected in this media.",
      confidence: 0.9,
      evidenceTimestampSec: 12,
      evidenceImageUrl: "https://cdn.example/ev.jpg",
      evidenceBlurred: true,
      analysisJson: null,
      analysisAttempts: 1,
      lastError: null,
      delayNotifiedAt: null,
      analyzedAt: now,
      decidedAt: now,
      decidedBy: "ai",
      appealStatus: "none",
      appealNote: null,
      appealAt: null,
      appealAnalysisJson: null,
      appealDecidedAt: null,
      appealDecidedById: null,
      appealFinalizedByModerator: false,
      createdAt: now,
      updatedAt: now,
      ...over,
    } as any;
  }

  it("allows a first appeal on a rejected version", () => {
    const s = serializeMediaReview(baseRow(), { includeEvidence: true });
    expect(s.canAppeal).toBe(true);
    expect(s.evidenceTimestampLabel).toBe("0:12");
    expect(s.evidenceImageUrl).toBeTruthy();
  });

  it("blocks appeal while one is already open", () => {
    const s = serializeMediaReview(baseRow({ appealStatus: "open" }), { includeEvidence: true });
    expect(s.canAppeal).toBe(false);
    expect(s.appealStatus).toBe("open");
  });

  it("blocks appeal after moderator upholds rejection", () => {
    const s = serializeMediaReview(baseRow({
      appealStatus: "upheld",
      appealFinalizedByModerator: true,
    }), { includeEvidence: true });
    expect(s.canAppeal).toBe(false);
  });

  it("blocks appeal after appeal was accepted", () => {
    const s = serializeMediaReview(baseRow({
      status: "approved",
      appealStatus: "accepted",
      violationCategory: null,
    }), { includeEvidence: false });
    expect(s.canAppeal).toBe(false);
  });

  it("hides evidence from public serialization", () => {
    const s = serializeMediaReview(baseRow(), { includeEvidence: false });
    expect(s.evidenceImageUrl).toBeNull();
    expect(s.evidenceTimestampSec).toBeNull();
  });

  it("shows 1/2 Analysis then 2/2 Verification progress labels", () => {
    const analyzing = serializeMediaReview(baseRow({
      status: "analyzing",
      progressStep: 1,
      progressLabel: "analysis",
      formalReason: null,
      violationCategory: null,
    }));
    expect(analyzing.progressDisplay).toMatch(/1\s*\/\s*2/);
    const verifying = serializeMediaReview(baseRow({ progressStep: 2 }));
    expect(verifying.progressDisplay).toMatch(/2\s*\/\s*2/);
  });
});
