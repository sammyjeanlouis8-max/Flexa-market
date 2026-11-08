/**
 * Upload completion must land in the notification bell only —
 * no top toast / push alert wiring for video_ready.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const uploadCenter = readFileSync(
  resolve(root, "marketplace/src/components/VideoUploadCenter.tsx"),
  "utf8",
);
const notifications = readFileSync(
  resolve(__dirname, "../routes/notifications.ts"),
  "utf8",
);
const queue = readFileSync(
  resolve(root, "marketplace/src/lib/videoUploadQueue.ts"),
  "utf8",
);

describe("video ready stays in notification bell", () => {
  it("does not toast when uploads settle", () => {
    expect(uploadCenter).not.toMatch(/useToast/);
    expect(uploadCenter).not.toMatch(/ToastAction/);
    expect(uploadCenter).not.toMatch(/allCompleteTitle|videoReadyTitle/);
    expect(uploadCenter).toMatch(/notification bell/);
  });

  it("still creates an in-app video_ready notification without push", () => {
    expect(queue).toMatch(/\/api\/notifications\/video-ready/);
    expect(notifications).toMatch(/type: "video_ready"/);
    expect(notifications).toMatch(/does NOT call sendPushToUser/);
    expect(notifications).not.toMatch(/sendPushToUser\(/);
  });
});
