import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesSession,
  matchesTaggedSession,
  matchesTokenBoundRefetch,
  silentlyRefreshToken,
} from "../src/lib/authSession.ts";

test("silent refresh classifies definitive auth failures separately from transient failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer invalid") {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
      }
      if (authorization === "Bearer suspended") {
        return new Response(JSON.stringify({ suspended: true }), { status: 403 });
      }
      if (authorization === "Bearer unavailable") {
        return new Response(JSON.stringify({ error: "Account unavailable" }), { status: 403 });
      }
      return new Response("upstream unavailable", { status: 503 });
    };

    assert.deepEqual(await silentlyRefreshToken("invalid"), { kind: "invalid", status: 401 });
    assert.deepEqual(await silentlyRefreshToken("suspended"), { kind: "suspended", status: 403 });
    assert.deepEqual(await silentlyRefreshToken("unavailable"), { kind: "transient", status: 403 });
    assert.deepEqual(await silentlyRefreshToken("transient"), { kind: "transient", status: 503 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("silent refresh coalesces concurrent requests for one token", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let resolveResponse: ((response: Response) => void) | undefined;
  try {
    globalThis.fetch = () => {
      calls += 1;
      return new Promise<Response>(resolve => {
        resolveResponse = resolve;
      });
    };

    const first = silentlyRefreshToken("same-token");
    const second = silentlyRefreshToken("same-token");
    assert.equal(first, second);
    assert.equal(calls, 1);

    resolveResponse?.(
      new Response(JSON.stringify({ token: "rotated-token" }), { status: 200 }),
    );
    assert.deepEqual(await first, { kind: "success", token: "rotated-token" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session generation guards reject stale data and refetch callbacks", () => {
  const current = { token: "new-token", generation: 8 };
  const old = { token: "old-token", generation: 7 };
  const tagged = { value: { availableAmount: 4 }, token: "old-token", generation: 7 };
  const oldRefetch = {
    token: "old-token",
    generation: 7,
    refetch: async () => undefined,
  };
  const currentRefetch = {
    token: "new-token",
    generation: 8,
    refetch: async () => undefined,
  };

  assert.equal(matchesSession(current, old), false);
  assert.equal(matchesTaggedSession(tagged, current), false);
  assert.equal(matchesTaggedSession({ ...tagged, token: "new-token", generation: 8 }, current), true);
  assert.equal(matchesTokenBoundRefetch(oldRefetch, current), false);
  assert.equal(matchesTokenBoundRefetch(currentRefetch, current), true);
});