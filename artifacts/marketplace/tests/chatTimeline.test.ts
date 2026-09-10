import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChatTimeline, chatDayKey, formatChatDay, formatChatTime, sameChatGroup } from "../src/lib/chatTimeline";

const iso = (y: number, m: number, d: number, hour: number, minute = 0) =>
  new Date(y, m - 1, d, hour, minute).toISOString();
const t = (key: string) => key;

test("bubble time is exact HH:mm, including fresh messages and midnight", () => {
  for (const language of ["en", "fr", "ht"]) {
    assert.equal(formatChatTime(iso(2026, 9, 10, 14, 2), language), "14:02");
    assert.equal(formatChatTime(iso(2026, 9, 10, 0, 4), language), "00:04");
  }
  assert.equal(formatChatTime("invalid", "fr"), "");
  assert.equal(formatChatTime(null, "fr"), "");
});

test("date headings use local calendar days across midnight and year changes", () => {
  const now = new Date(2026, 0, 1, 0, 1).getTime();
  assert.equal(formatChatDay(iso(2026, 1, 1, 0), "fr", t, now), "messages.timeToday");
  assert.equal(formatChatDay(iso(2025, 12, 31, 23, 59), "fr", t, now), "messages.timeYesterday");
  assert.equal(formatChatDay(iso(2025, 12, 30, 12), "fr", t, now), "30 décembre 2025");
  assert.equal(formatChatDay("invalid", "en", t, now), "");
});

test("DST calendar boundaries do not depend on elapsed 24 hours", () => {
  for (const [m, d] of [[3, 9], [11, 2]]) {
    const now = new Date(2026, m - 1, d, 0, 1).getTime();
    const yesterday = new Date(2026, m - 1, d - 1, 0, 1).getTime();
    assert.equal(chatDayKey(now)! - chatDayKey(yesterday)!, 1);
    assert.equal(formatChatDay(yesterday, "en", t, now), "messages.timeYesterday");
  }
});

test("pending voices interleave chronologically without moving to a newer day", () => {
  const messages = [
    { id: 2, senderId: 1, createdAt: iso(2026, 9, 10, 14) },
    { id: 1, senderId: 2, createdAt: iso(2026, 9, 9, 10) },
  ];
  const pending = [{ id: "voice-1", createdAt: new Date(2026, 8, 9, 11).getTime() }];
  const entries = buildChatTimeline(messages, pending);
  assert.deepEqual(entries.map(e => e.key), ["message-1", "voice-1", "message-2"]);
  assert.equal(entries.filter((e, i) => e.day !== entries[i - 1]?.day).length, 2);
  assert.deepEqual(messages.map(m => m.id), [2, 1], "input/cache is not mutated");
});

test("groups split on sender, midnight or a long gap, not on delivery state", () => {
  const messages = [
    { id: 1, senderId: 1, createdAt: iso(2026, 9, 9, 23, 59) },
    { id: 2, senderId: 1, createdAt: iso(2026, 9, 10, 0, 1) },
    { id: 3, senderId: 2, createdAt: iso(2026, 9, 10, 0, 2) },
    { id: 4, senderId: 2, createdAt: iso(2026, 9, 10, 0, 20) },
  ];
  const pending = [{ id: "voice-1", createdAt: new Date(2026, 8, 10, 0, 3).getTime() }];
  const entries = buildChatTimeline(messages, pending);
  assert.equal(sameChatGroup(entries[0], entries[1], 2), false);
  assert.equal(sameChatGroup(entries[1], entries[2], 2), false);
  assert.equal(sameChatGroup(entries[2], entries[3], 2), true);
  assert.equal(sameChatGroup(entries[3], entries[4], 2), false);
  assert.equal(sameChatGroup(undefined, entries[0], 2), false);
});