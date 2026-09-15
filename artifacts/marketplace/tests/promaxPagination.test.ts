import assert from "node:assert/strict";
import { test } from "node:test";
import { getPromaxNextPageParam, serializePromaxPageParam } from "../src/lib/promaxPagination.ts";

test("cached first page keeps its rotation token for every next page", () => {
  const firstPage = {
    listings: [],
    page: 1,
    totalPages: 3,
    promaxRotation: { hourKey: "2030-01-01T12:00:00.000Z", demotedListingIds: [70], demotionsPinned: true },
  };
  const restoredPageParam = { page: 1, hourKey: null };
  const next = getPromaxNextPageParam(
    { listings: [], page: 2, totalPages: 3, promaxRotation: { hourKey: "2030-01-01T13:00:00.000Z" } },
    [firstPage],
    [restoredPageParam],
  );
  assert.deepEqual(next, { page: 3, hourKey: "2030-01-01T12:00:00.000Z", demotedIds: [70], demotionsPinned: true });
});

test("cap crossing after page one keeps empty frozen demotions and offsets pinned", () => {
  const next = getPromaxNextPageParam(
    { listings: [{ id: 72 }], page: 1, totalPages: 2, promaxRotation: { hourKey: "2030-01-01T13:00:00.000Z", demotedListingIds: [], demotionsPinned: true } },
    [{ listings: [{ id: 71 }], page: 1, totalPages: 2, promaxRotation: { hourKey: "2030-01-01T13:00:00.000Z", demotedListingIds: [], demotionsPinned: true } }],
    [{ page: 1, hourKey: null, demotedIds: [], demotionsPinned: false }],
  )!;
  // Page one was cap-minus-one (no demotions). Even after the displayed
  // impression reaches the cap, page two carries the frozen empty decision.
  assert.deepEqual(serializePromaxPageParam(next), {
    hourKey: "2030-01-01T13:00:00.000Z",
    demotionsPinned: "1",
  });
  assert.equal(next.page, 2);
  assert.deepEqual(next.demotedIds, []);
});

test("restored page params take precedence over a later response hour", () => {
  const next = getPromaxNextPageParam(
    { listings: [], page: 1, totalPages: 2, promaxRotation: { hourKey: "2030-01-01T13:00:00.000Z" } },
    [{ listings: [], page: 1, totalPages: 2, promaxRotation: { hourKey: "2030-01-01T13:00:00.000Z" } }],
    [{ page: 1, hourKey: "2030-01-01T12:00:00.000Z", demotedIds: [], demotionsPinned: true }],
  );
  assert.deepEqual(next, { page: 2, hourKey: "2030-01-01T12:00:00.000Z", demotedIds: [], demotionsPinned: true });
});