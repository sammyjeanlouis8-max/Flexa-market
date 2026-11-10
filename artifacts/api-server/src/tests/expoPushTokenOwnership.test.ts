import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const expoPush = fs.readFileSync(path.join(here, "../lib/expo-push.ts"), "utf8");
const pushRoute = fs.readFileSync(path.join(here, "../routes/push.ts"), "utf8");
const channels = fs.readFileSync(path.join(here, "../lib/pushChannels.ts"), "utf8");
const messages = fs.readFileSync(path.join(here, "../routes/messages.ts"), "utf8");

describe("Expo push token ownership + channels", () => {
  it("deletes tokens only for the authenticated userId", () => {
    expect(expoPush).toMatch(/eq\(expoPushTokensTable\.userId,\s*userId\)/);
    expect(expoPush).toMatch(/deleteExpoPushToken\([\s\S]*userId:\s*number/);
    expect(pushRoute).toMatch(/token or deviceId required/);
    expect(pushRoute).toMatch(/deleted/);
  });

  it("upserts replace prior deviceId bindings on refresh/account switch", () => {
    expect(expoPush).toMatch(/eq\(expoPushTokensTable\.deviceId,\s*opts\.deviceId\)/);
  });

  it("canonical channels include flexa-messages and system", () => {
    expect(channels).toContain('"flexa-messages"');
    expect(channels).toContain('"admin-broadcast"');
    expect(channels).toContain('"flexa-tv"');
    expect(channels).toContain('"system"');
    expect(messages).toMatch(/channelId:\s*"flexa-messages"/);
  });
});
