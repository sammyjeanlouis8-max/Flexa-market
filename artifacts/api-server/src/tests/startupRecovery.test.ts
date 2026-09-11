import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";

const main = readFileSync(new URL("../../../marketplace/src/main.tsx", import.meta.url), "utf8");
const recovery = main.slice(main.indexOf("// ── Chunk-error"), main.indexOf("declare const __BUILD_ID__"));
const code = transformSync(
  recovery + "\nglobalThis.recovery = { GlobalErrorBoundary, autoReloadOnceForChunk };",
  { loader: "tsx", define: { "import.meta.env.DEV": "false" } },
).code;

function runtime(storage = new Map<string, string>(), storageBlocked = false) {
  const reload = vi.fn();
  const context: any = {
    Component: class {
      state: any;
      props: any;
      constructor(props: any) { this.props = props; }
      setState(update: any) { this.state = { ...this.state, ...update }; }
    },
    console: { error: vi.fn() },
    window: { addEventListener: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error("Storage denied");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    location: { reload },
    setTimeout, clearTimeout, Date, Error,
  };
  runInNewContext(code, context);
  return { ...context.recovery, reload };
}

afterEach(() => vi.useRealTimers());

describe("startup error recovery", () => {
  it("renders recovery from the first caught error, before didCatch runs", () => {
    const { GlobalErrorBoundary } = runtime();
    expect(GlobalErrorBoundary.getDerivedStateFromError(new Error("Transient")).isRetrying).toBe(true);
  });
  it("allows one quiet render retry then exposes a persistent failure", () => {
    vi.useFakeTimers();
    const { GlobalErrorBoundary } = runtime();
    const boundary = new GlobalErrorBoundary({});
    const error = new Error("Render failed");
    boundary.setState(GlobalErrorBoundary.getDerivedStateFromError(error));
    boundary.componentDidCatch(error);
    expect(boundary.state.isRetrying).toBe(true);
    vi.advanceTimersByTime(600);
    expect(boundary.state.hasError).toBe(false);
    boundary.setState(GlobalErrorBoundary.getDerivedStateFromError(error));
    boundary.componentDidCatch(error);
    expect(boundary.state.isRetrying).toBe(false);
    expect(boundary.state.hasError).toBe(true);
  });
  it("reloads once and preserves its guard across document loads", () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    const first = runtime(storage);
    expect(first.autoReloadOnceForChunk()).toBe(true);
    expect(first.autoReloadOnceForChunk()).toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(first.reload).toHaveBeenCalledOnce();
    const next = runtime(storage);
    expect(next.autoReloadOnceForChunk()).toBe(false);
    expect(next.reload).not.toHaveBeenCalled();
  });
  it("falls back to user recovery if storage cannot guard automatic reloads", () => {
    const app = runtime(new Map(), true);
    expect(app.autoReloadOnceForChunk()).toBe(false);
    expect(app.reload).not.toHaveBeenCalled();
  });
  it("stops displaying the recovery spinner if a requested reload never completes", () => {
    vi.useFakeTimers();
    const { GlobalErrorBoundary } = runtime();
    const boundary = new GlobalErrorBoundary({});
    const error = new Error("Failed to fetch dynamically imported module");
    boundary.setState(GlobalErrorBoundary.getDerivedStateFromError(error));
    boundary.componentDidCatch(error);
    expect(boundary.state.isRetrying).toBe(true);
    vi.advanceTimersByTime(8_000);
    expect(boundary.state.isRetrying).toBe(false);
  });
});