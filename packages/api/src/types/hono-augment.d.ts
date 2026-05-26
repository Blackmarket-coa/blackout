import 'hono';

// The require-user middleware stashes the decoded auth token under `user`.
// Declaring it on Hono's context variable map lets `c.get('user')` type-check
// on route-scoped `new Hono()` instances (callers narrow it with `as`).
declare module 'hono' {
  interface ContextVariableMap {
    user: unknown;
  }
}
