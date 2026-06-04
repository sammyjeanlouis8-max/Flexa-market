import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, "../../../marketplace/src/pages");

function readPage(name: string): string {
  return readFileSync(resolve(pagesDir, name), "utf8");
}

describe("chat layout regression guards", () => {
  it("CalcAI (Calculator.tsx) keeps the bottom-align wrapper so there is no blank gap", () => {
    const src = readPage("Calculator.tsx");
    expect(src).toContain("flex-1 overflow-y-auto");
    expect(src).toContain("flex flex-col gap-4 min-h-full");
    expect(src).toMatch(/messages\.length > 0 \? "justify-end" : ""/);
  });

  it("FlexaBot (Chatbot.tsx) keeps the bottom-align wrapper so there is no blank gap", () => {
    const src = readPage("Chatbot.tsx");
    expect(src).toContain("flex-1 overflow-y-auto");
    expect(src).toContain("flex flex-col gap-4 min-h-full");
    expect(src).toMatch(/messages\.length > 0 \? "justify-end" : ""/);
  });
});

describe("voice recorder mic-release regression guards (Messages.tsx)", () => {
  const src = readPage("Messages.tsx");

  it("tracks the recording stream in a ref and exposes a single mic-stop helper", () => {
    expect(src).toContain("recordingStreamRef");
    expect(src).toContain("const stopMicStream =");
    expect(src).toContain("recordingStreamRef.current.getTracks().forEach");
  });

  it("releases the mic on every exit path (not only inside onstop)", () => {
    // stopMicStream() must be called from several places: error, cancel, send, cleanup.
    const calls = src.match(/stopMicStream\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("tears down the live waveform analyser alongside the mic", () => {
    expect(src).toContain("const stopWaveform =");
  });
});
