/**
 * AI-plugin gating policy (Phase 2), defense-in-depth.
 *
 * AI tooling is confined to AI dens (`den/classification.ts` `aiToolsEnabled`).
 * A plugin "uses AI" if it was granted the `ai.inference` capability or carries
 * the `ai` domain. The policy below is the single source of truth consulted at
 * two layers:
 *   1. Install/activation time on the server (`evaluateAiInstall`).
 *   2. Runtime in the client sandbox (`aiRuntimeAllowed`) — the authoritative
 *      boundary, since a plugin can outlive the den it was installed in.
 *
 * These are pure functions with no I/O so both layers and tests share them.
 */

import { aiToolsEnabled, type DenType } from '../den/classification';
import type { PluginDomain } from './domain';
import type { InstallScopeType } from './installation';

export const AI_INFERENCE_CAPABILITY = 'ai.inference';

/** True when a plugin needs an AI den to run (by capability or domain). */
export function pluginUsesAi(
    capabilities: readonly string[] = [],
    domain?: PluginDomain | null,
): boolean {
    return capabilities.includes(AI_INFERENCE_CAPABILITY) || domain === 'ai';
}

export type AiGateReason = 'ok' | 'ai_requires_den_scope' | 'ai_requires_ai_den';

export interface AiGateResult {
    allowed: boolean;
    reason: AiGateReason;
}

/**
 * Server-side install/activation gate. Non-AI plugins always pass. An AI plugin
 * may only install at a `den` scope, and — when the caller can assert the den's
 * type — that den must be an AI den. The server cannot itself read the den's
 * Matrix classification, so an undefined `denType` is allowed through here and
 * the runtime sandbox gate (`aiRuntimeAllowed`) remains the hard boundary.
 */
export function evaluateAiInstall(
    usesAi: boolean,
    scopeType: InstallScopeType,
    denType?: DenType,
): AiGateResult {
    if (!usesAi) return { allowed: true, reason: 'ok' };
    if (scopeType !== 'den') return { allowed: false, reason: 'ai_requires_den_scope' };
    if (denType && !aiToolsEnabled(denType)) {
        return { allowed: false, reason: 'ai_requires_ai_den' };
    }
    return { allowed: true, reason: 'ok' };
}

/**
 * Runtime gate consulted by the sandbox before dispatching an `ai.inference`
 * RPC. AI is permitted only when the active den resolves to an AI den; an
 * unknown den type denies (fail-closed) because this is the real boundary.
 */
export function aiRuntimeAllowed(denType?: DenType): boolean {
    return denType ? aiToolsEnabled(denType) : false;
}
