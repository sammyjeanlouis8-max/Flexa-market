export type SilentRefreshResult =
  | { kind: "success"; token: string }
  | { kind: "invalid"; status: 401 }
  | { kind: "suspended"; status: 403 }
  | { kind: "unavailable"; status: 403 }
  | { kind: "transient"; status?: number };

export type SessionIdentity = {
  token: string | null;
  generation: number;
};

export type SessionTagged<T> = {
  value: T;
  token: string;
  generation: number;
};

export type TokenBoundRefetch = {
  token: string;
  generation: number;
  refetch: () => Promise<unknown>;
};

export function matchesSession(
  current: SessionIdentity,
  expected: SessionIdentity,
): boolean {
  return (
    current.token === expected.token &&
    current.generation === expected.generation
  );
}

export function matchesTaggedSession<T>(
  tagged: SessionTagged<T> | null,
  current: SessionIdentity,
): boolean {
  return Boolean(
    tagged &&
      matchesSession(current, {
        token: tagged.token,
        generation: tagged.generation,
      }),
  );
}

export function matchesTokenBoundRefetch(
  entry: TokenBoundRefetch | null,
  expected: SessionIdentity,
): entry is TokenBoundRefetch {
  return Boolean(
    entry &&
      entry.token === expected.token &&
      entry.generation === expected.generation,
  );
}

// Keep refresh requests single-flight. Multiple tabs/events can resume at the
// same time; they must not race to rotate the same token.
let silentRefreshInFlight: Promise<SilentRefreshResult> | null = null;
let silentRefreshToken: string | null = null;

export function silentlyRefreshToken(token: string): Promise<SilentRefreshResult> {
  if (!token) return Promise.resolve({ kind: "transient" });
  if (silentRefreshInFlight && silentRefreshToken === token) {
    return silentRefreshInFlight;
  }
  if (silentRefreshInFlight) {
    // Serialize a refresh for a different token behind the current request.
    // The continuation will coalesce with any other callers for that token.
    return silentRefreshInFlight.then(() => silentlyRefreshToken(token));
  }

  const request = fetch("/api/auth/refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async response => {
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.token === "string" && data.token) {
        return { kind: "success", token: data.token } as const;
      }
      if (response.status === 401) return { kind: "invalid", status: 401 } as const;
      if (response.status === 403) {
        return data?.suspended
          ? { kind: "suspended", status: 403 } as const
          : { kind: "unavailable", status: 403 } as const;
      }
      return { kind: "transient", status: response.status } as const;
    })
    .catch(() => ({ kind: "transient" as const }));

  silentRefreshToken = token;
  silentRefreshInFlight = request;
  void request.finally(() => {
    if (silentRefreshInFlight === request) {
      silentRefreshInFlight = null;
      silentRefreshToken = null;
    }
  });
  return request;
}