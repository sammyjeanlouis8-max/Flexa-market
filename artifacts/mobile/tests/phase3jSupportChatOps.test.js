"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const apiRoot = path.join(root, "..", "api-server");

test("Phase 3J support API covers tickets, availability, agent actions, analytics", () => {
  const api = read("lib/supportApi.ts");
  for (const needle of [
    "/support/threads",
    "/support/availability",
    "/support/tickets/by-ref/",
    "/support/threads/${threadId}/claim",
    "/support/threads/${threadId}/reopen",
    "/support/threads/${threadId}/close",
    "/support/threads/${threadId}/assign",
    "/support/threads/${threadId}/priority",
    "/admin/support/analytics",
    "/support/knowledge",
    "/chatbot/message",
    "botHistory",
  ]) {
    assert.match(api, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$\{[^}]+\}/g, ".+")));
  }
  assert.match(api, /Voice messages are not supported in support chat/);
  assert.doesNotMatch(api, /voice messages are supported/i);
});

test("Phase 3J Support Center is native with ticket confirmation + ETA", () => {
  const screen = read("app/support.tsx");
  assert.doesNotMatch(screen, /NativePlaceholder|WebView/);
  assert.match(screen, /createSupportThread|ticketRef|supportTicketCreated|fetchSupportAvailability/);
  assert.match(screen, /fetchSupportKnowledge|lookupSupportTicketByRef/);
});

test("Phase 3J ticket thread supports reopen, video, staff actions, no voice", () => {
  const screen = read("app/support/[id].tsx");
  assert.doesNotMatch(screen, /NativePlaceholder|WebView/);
  assert.match(screen, /reopenSupportThread|uploadAndSend\("video"\)|claimSupportThread|mic-off/);
  assert.match(screen, /isInternal|rateSupportThread/);
});

test("Phase 3J FlexaBot escalates with botHistory and deep links", () => {
  const bot = read("app/chatbot.tsx");
  assert.doesNotMatch(bot, /NativePlaceholder|WebView/);
  assert.match(bot, /escalateSuggested|botHistory|createSupportThread|deepLinks/);
  assert.match(bot, /flexabotEscalate|QUICK_PROMPTS/);
});

test("Phase 3J agent + admin desks exist and gate on support roles", () => {
  assert.ok(fs.existsSync(path.join(root, "app/support-agent/index.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/support-admin.tsx")));
  const agent = read("app/support-agent/index.tsx");
  const admin = read("app/support-admin.tsx");
  const roles = read("lib/supportRoles.ts");
  assert.match(agent, /isSupportStaff|setMySupportAvailability|fetchSupportThreads/);
  assert.match(admin, /fetchSupportAnalytics|assignSupportThread|canAssignSupportTickets/);
  assert.match(roles, /isSupportStaff|canAssignSupportTickets|agentDisplayName/);
  assert.match(agent, /agentDisplayName/);
  assert.doesNotMatch(agent, /label:\s*"Admin"|title:\s*"Admin"/);
});

test("Phase 3J chat thread can block and report via existing APIs", () => {
  const chat = read("app/chat/[id].tsx");
  const blocks = read("lib/blocksApi.ts");
  assert.match(blocks, /POST.*\/users\/\$\{userId\}\/block|method:\s*"POST"/);
  assert.match(blocks, /\/reports/);
  assert.match(chat, /blockUser|reportTarget/);
});

test("Phase 3J localization keys for support/FlexaBot in en/ht/fr/es", () => {
  const lang = read("context/LanguageContext.tsx");
  for (const key of [
    "supportTitle",
    "supportTicketCreated",
    "flexabotEscalate",
    "supportAgentDesk",
    "supportAdminDesk",
    "helpTitle",
  ]) {
    assert.match(lang, new RegExp(`${key}:`));
  }
});

test("Phase 3J inventory marks admin-support FULLY_NATIVE and recounts", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["admin-support"].status, "FULLY_NATIVE");
  assert.equal(byId["support-tickets"].status, "FULLY_NATIVE");
  assert.equal(byId.chatbot.status, "FULLY_NATIVE");
  // Phase 3K may upgrade admin-panel; 3J only requires support surfaces remain native.
  assert.ok(
    byId["admin-panel"].status === "PLACEHOLDER" ||
      byId["admin-panel"].status === "FULLY_NATIVE" ||
      byId["admin-panel"].status === "PARTIALLY_NATIVE",
  );
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 59);
  assert.ok(inv.verification?.phase3j);
  assert.ok(/phase3j|phase3k|phase3l|phase3m|phase3n|phase3o/.test(inv.branch));
});

test("Phase 3J deep links still cover support and chatbot", () => {
  const deep = read("lib/notificationDeepLink.ts");
  assert.match(deep, /\/support/);
  assert.match(deep, /\/chatbot/);
});

test("Phase 3J backend still forbids voice on support messages", () => {
  const support = fs.readFileSync(path.join(apiRoot, "src/routes/support.ts"), "utf8");
  assert.match(support, /Voice messages are not supported in support chat/);
  assert.match(support, /\/admin\/support\/analytics/);
  assert.match(support, /botHistory/);
});
