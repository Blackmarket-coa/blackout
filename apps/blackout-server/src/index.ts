/**
 * Canonical Blackout server app entrypoint.
 *
 * Runtime execution is delegated to @blackout/api via package scripts,
 * but this file and tsconfig provide a standard TypeScript app shape
 * for deployment-readiness tooling and future direct bootstrap logic.
 */

export const blackoutServerEntrypoint = '@blackout/api';
