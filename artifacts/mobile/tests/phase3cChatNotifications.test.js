"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3C chat screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of [
    "app/(tabs)/inbox.tsx",
    "app/chat/[id].tsx",
    "components/PushBootstrap.tsx",
  ]) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(
      /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
      false,
      rel,
    );
  }
});

test("chat API covers conversations list, messages, send, create", () => {
  const api = read("lib/chatApi.ts");
  assert.match(api, /\/conversations/);
  assert.match(api, /\/conversations\/unread-count/);
  assert.match(api, /\/conversations\/\$\{conversationId\}\/messages/);
  assert.match(api, /createConversation/);
  assert.match(api, /sendMessage/);
  assert.match(api, /translateMessage/);
});

test("socket client uses production /api/socket.io path", () => {
  const sock = read("lib/chatSocket.ts");
  assert.match(sock, /socket\.io-client/);
  assert.match(sock, /\/api\/socket\.io/);
  assert.match(sock, /join-conv|new-message/);
});

test("inbox and thread wire realtime + polling fallback", () => {
  const inbox = read("app/(tabs)/inbox.tsx");
  const chat = read("app/chat/[id].tsx");
  assert.match(inbox, /fetchConversations/);
  assert.match(inbox, /onNewMessage|onConvUpdate/);
  assert.match(chat, /sendMessage/);
  assert.match(chat, /joinConversation/);
  assert.match(chat, /setInterval/);
  assert.match(chat, /uploadChatImage|ImagePicker/);
});

test("listing Message creates conversation then opens chat", () => {
  const listing = read("app/listing/[id].tsx");
  assert.match(listing, /createConversation/);
  assert.match(listing, /\/chat\//);
});

test("smart notification deep-links map messages URL to /chat/:id", () => {
  const deep = read("lib/notificationDeepLink.ts");
  const push = read("components/PushBootstrap.tsx");
  assert.match(deep, /\/chat\//);
  assert.match(deep, /\/messages\/\(\\\\d\+\)|messages/);
  assert.match(push, /pathFromNotificationData|addNotificationResponseReceivedListener/);
});

test("inventory marks inbox and chat-thread FULLY_NATIVE", () => {
  const data = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(data.features.map((f) => [f.id, f]));
  assert.equal(byId.inbox.status, "FULLY_NATIVE");
  assert.equal(byId["chat-thread"].status, "FULLY_NATIVE");
  assert.equal(byId["smart-notifications"].status, "FULLY_NATIVE");
  assert.equal(byId.sell.status, "PLACEHOLDER");
  assert.ok(data.summaryCounts.FULLY_NATIVE >= 22);
});

test("mobile package depends on socket.io-client", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies?.["socket.io-client"] || pkg.devDependencies?.["socket.io-client"]);
});
