/**
 * Playwright worker fixture options. Used by playwright.config.ts to thread
 * homeserver-type and other Blackout-specific options through to project
 * configurations.
 *
 * This file exists so the existing playwright.config.ts can import it; the
 * full upstream Element-web harness (login fixtures, homeserver fixtures,
 * media fixtures) is not yet ported. As specs are migrated under
 * playwright/e2e/, extend this type with their fixture surfaces.
 */
export interface WorkerOptions {
  /** Homeserver implementation under test. Defaults to synapse via baseURL. */
  homeserverType?: 'synapse' | 'dendrite' | 'pinecone';
}
