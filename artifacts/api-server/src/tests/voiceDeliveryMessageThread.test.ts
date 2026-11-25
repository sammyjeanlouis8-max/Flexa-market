/**
 * Contract: Web/WebView voice delivery in MessageThread must not jam the
 * outbox, must keep duration accurate, and must isolate voice sends from text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const thread = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/messages/MessageThread.tsx"),
  "utf8",
);

describe("MessageThread voice delivery contract", () => {
  it("uses separate chat mutate and voice mutateAsync hooks", () => {
    expect(thread).toMatch(/mutate:\s*sendChatMutation/);
    expect(thread).toMatch(/mutateAsync:\s*sendVoiceMutation/);
    expect(thread).not.toMatch(/\bconst sendMsg = useSendMessage/);
  });

  it("updates duration from metadata and durationchange without clobbering knownDuration", () => {
    expect(thread).toMatch(/onLoadedMetadata=\{updateAudioDuration\}/);
    expect(thread).toMatch(/onDurationChange=\{updateAudioDuration\}/);
    expect(thread).toMatch(
      /knownDurationSec && knownDurationSec > 0 && \(!Number\.isFinite\(duration\) \|\| duration <= 0\)/,
    );
  });

  it("keeps the flush lock owned by the active upload (wake does not force-clear)", () => {
    const wake = thread.match(/const wakeQueue = \(\) => \{[\s\S]*?\n\s*\};/);
    expect(wake?.[0]).toBeTruthy();
    expect(wake?.[0]).not.toMatch(/voiceQueueBusyRef\.current = false/);
    expect(thread).toMatch(/The active flush owns the lock until it settles/);
  });

  it("does not drop the busy lock on cancel mid-upload", () => {
    const cancel = thread.match(
      /const cancelPendingVoiceSend = useCallback\(async \(id: string\) => \{[\s\S]*?\}, \[sendingVoiceId\]\);/,
    );
    expect(cancel?.[0]).toBeTruthy();
    expect(cancel?.[0]).not.toMatch(/voiceQueueBusyRef\.current = false/);
    expect(cancel?.[0]).toMatch(/cancellation/);
  });

  it("keeps recordedSecs in sync when resuming a paused recording", () => {
    expect(thread).toMatch(/session\.recordedSecs \+= 1/);
    expect(thread).toMatch(/setRecordingSecs\(session\.recordedSecs\)/);
  });

  it("races voice mutateAsync against a 30s timeout", () => {
    expect(thread).toMatch(/sendVoiceMutation\(\{ id: convId, data: body as any \}\)/);
    expect(thread).toMatch(/Voice send timed out/);
    expect(thread).toMatch(/30_000/);
  });

  it("uploads voice bytes with XHR so iOS sets Content-Length", () => {
    expect(thread).toMatch(/function putViaXhr/);
    expect(thread).toMatch(/xhr\.send\(file\)/);
    expect(thread).toMatch(/XMLHttpRequest/);
  });
});
