/**
 * Guards: finished video uploads must not toast / float over Home.
 * They live on the Bouillon menu page instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const center = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/VideoUploadCenter.tsx"),
  "utf8",
);
const bouillon = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/Bouillon.tsx"),
  "utf8",
);
const app = readFileSync(
  resolve(__dirname, "../../../marketplace/src/App.tsx"),
  "utf8",
);

describe("video upload Home / Bouillon separation", () => {
  it("routes /bouillon to the Bouillon page", () => {
    expect(app).toMatch(/path="\/bouillon"/);
    expect(app).toMatch(/import\("@\/pages\/Bouillon"\)/);
  });

  it("lists uploads on the Bouillon page", () => {
    expect(bouillon).toMatch(/VideoUploadJobRow/);
    expect(bouillon).toMatch(/nav\.bouillon/);
  });

  it("never fires a completion toast from the floating center", () => {
    expect(center).not.toMatch(/useToast/);
    expect(center).not.toMatch(/allCompleteTitle/);
    expect(center).not.toMatch(/toast\s*\(/);
  });

  it("suppresses floating chrome on Home and Bouillon", () => {
    expect(center).toMatch(/shouldSuppressFloatingBar/);
    expect(center).toMatch(/clean === "\/"/);
    expect(center).toMatch(/clean === "\/bouillon"/);
  });
});
