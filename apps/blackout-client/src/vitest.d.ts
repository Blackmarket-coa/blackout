// Minimal ambient stub for `vitest` so colocated `src/**/*.test.tsx` files
// typecheck under the app's tsconfig (which does not pull in vitest's own
// types). Only what the tests use is declared.
//
// Keep the lifecycle hooks complete. `afterEach` was missing, so the first
// colocated test to need one failed typecheck with "has no exported member",
// which reads as a broken import rather than an incomplete stub.
declare module 'vitest' {
    export const describe: (...args: any[]) => any;
    export const it: (...args: any[]) => any;
    export const expect: any;
    export const beforeAll: (...args: any[]) => any;
    export const beforeEach: (...args: any[]) => any;
    export const afterEach: (...args: any[]) => any;
    export const afterAll: (...args: any[]) => any;
    export const vi: any;
}
