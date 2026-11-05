/**
 * Contract tests for Add New Product publish validation UX.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SELL_VALIDATION_EN,
  collectExtraPublishErrors,
  countErrorsBySection,
  formatSectionMissingLabel,
} from "../../../marketplace/src/lib/sellValidation";

const sell = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/Sell.tsx"),
  "utf8",
);
const shell = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/seller/SellerCenterShell.tsx"),
  "utf8",
);
const en = readFileSync(
  resolve(__dirname, "../../../marketplace/src/i18n/locales/en.ts"),
  "utf8",
);

describe("Sell publish validation contract", () => {
  it("uses English default validation copy (no HT-only toast titles)", () => {
    expect(sell).not.toMatch(/Gen enfòmasyon ki manke/);
    expect(sell).not.toMatch(/Ranpli chan obligatwa/);
    expect(sell).not.toMatch(/Erè piblikasyon/);
    expect(sell).toMatch(/sell-validation-banner/);
    expect(sell).toMatch(/handlePublishClick/);
    expect(sell).toMatch(/applyPublishErrors/);
    expect(sell).toMatch(/validationMessages\.bannerTitle/);
    expect(en).toMatch(/bannerTitle:\s*"Please complete the required information"/);
    expect(en).toMatch(/titleTooShort:\s*"Title must be at least 3 characters\."/);
    expect(en).toMatch(/categoryRequired:\s*"Please select a category\."/);
  });

  it("accordion sections expose error counts and completed badges", () => {
    expect(shell).toMatch(/errorCount/);
    expect(shell).toMatch(/missingLabel/);
    expect(shell).toMatch(/completedLabel/);
    expect(shell).toMatch(/data-section-status/);
    expect(sell).toMatch(/sectionErrorCounts\.info/);
    expect(sell).toMatch(/formatSectionMissingLabel/);
  });

  it("keeps sticky Save Draft + Publish Product actions", () => {
    expect(sell).toMatch(/button-save-draft-mobile/);
    expect(sell).toMatch(/button-publish-mobile/);
    expect(sell).toMatch(/Publish Product/);
    expect(sell).toMatch(/Save Draft/);
  });

  it("moves category into Product Information and highlights invalid fields", () => {
    const infoIdx = sell.indexOf('id="info"');
    const categoryIdx = sell.indexOf('name="categoryId"');
    const mediaIdx = sell.indexOf('id="media"');
    expect(infoIdx).toBeGreaterThan(-1);
    expect(categoryIdx).toBeGreaterThan(infoIdx);
    expect(categoryIdx).toBeLessThan(mediaIdx);
    expect(sell).toMatch(/FieldErrorIcon/);
    expect(sell).toMatch(/border-red-500/);
  });
});

describe("sellValidation helpers", () => {
  it("formats missing labels and counts sections", () => {
    expect(formatSectionMissingLabel(2)).toBe("2 fields missing");
    expect(countErrorsBySection(["title", "categoryId", "photos"])).toEqual({
      info: 2,
      media: 1,
      pricing: 0,
      delivery: 0,
      review: 0,
    });
  });

  it("requires photos for publish extras", () => {
    expect(
      collectExtraPublishErrors({ photoCount: 0, minPhotos: 2, country: "Haiti" }).photos,
    ).toBe(SELL_VALIDATION_EN.photoRequired);
  });
});
