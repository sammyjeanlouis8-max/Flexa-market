---
name: Flexa auth token pattern
description: useAuth() returns token as a raw string, not a getter function — calling token() crashes at runtime.
---

# Flexa Auth Token Pattern

## The rule
`useAuth()` returns `{ token: string | null, ... }` — `token` is the raw JWT string, **not** a getter function.

**Wrong:**
```ts
const { token } = useAuth();
headers: { Authorization: `Bearer ${token()}` }  // ❌ TypeError: token is not a function
```

**Right:**
```ts
const { token } = useAuth();
const authHeader = token ? `Bearer ${token}` : "";
headers: { Authorization: authHeader }  // ✅
```

**Why:** The auth context stores the JWT string in React state (`useState<string | null>`). Old inline components in Admin.tsx defined their own local `const token = () => localStorage.getItem(...)` getter — do not copy that pattern into new standalone pages that import from `useAuth`.

**How to apply:** Any new page that calls `/api/*` endpoints should destructure `token` from `useAuth()` and use it directly as a string. Construct `authHeader` once at component top level and pass it to every fetch.
