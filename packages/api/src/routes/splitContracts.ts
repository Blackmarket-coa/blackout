// Smart Split Contract endpoints (FBM → Blackout, service-to-service).
//
//   POST /v1/split-contracts/activate   — write a contract as a Matrix state event
//   GET  /v1/split-contracts/:spaceId    — list active contracts in a Space
//
// Auth: an internal shared secret in `X-BMC-Internal-Secret`, compared in
// constant time against `BLACKOUT_INTERNAL_SECRET`. This is the internal
// service-to-service secret, distinct from the public marketplace webhook
// signature.
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isSplitContractPayload, type SplitContractPayload } from '@blackout/protocol';
import {
    activateSplitContract,
    listSplitContracts,
} from '../services/fbmMatrixBridge/splitContract';
import { incrementCounter, logEvent } from '../services/marketplaceObservability';

const splitContracts = new Hono();

const partySchema = z.object({
    matrixId: z.string().min(1),
    fbmVendorId: z.string().min(1),
    percentage: z.number().min(0).max(100),
    role: z.string().min(1),
});

const activateSchema = z.object({
    spaceId: z.string().min(1),
    contract: z.object({
        contractId: z.string().min(1),
        name: z.string().min(1),
        appliesTo: z.array(z.string()),
        parties: z.array(partySchema).min(1),
        effectiveFrom: z.string().min(1),
        effectiveUntil: z.string().optional(),
        minimumThresholdCents: z.number().min(0),
        status: z.enum(['active', 'archived']),
    }),
});

function internalSecretValid(provided: string | undefined): boolean {
    const expected = process.env.BLACKOUT_INTERNAL_SECRET;
    if (!expected || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

splitContracts.post('/activate', async (c) => {
    if (!internalSecretValid(c.req.header('x-bmc-internal-secret'))) {
        return c.json({ error: 'unauthorized' }, 401);
    }

    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'invalid_json' }, 400);
    }

    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'invalid_payload', detail: parsed.error.flatten() }, 400);
    }

    const contract = parsed.data.contract as SplitContractPayload;
    const result = await activateSplitContract({ spaceId: parsed.data.spaceId, contract });

    if (!result.ok) {
        if (result.reason === 'invalid_split') {
            return c.json({ error: 'invalid_split', detail: 'party percentages must sum to 100' }, 400);
        }
        if (result.reason === 'invalid_payload') {
            return c.json({ error: 'invalid_payload' }, 400);
        }
        incrementCounter('split_contract_activate_failed');
        return c.json({ error: 'matrix_error' }, 502);
    }

    incrementCounter('split_contract_activated');
    logEvent('split_contract_activated', {
        spaceId: parsed.data.spaceId,
        contractId: contract.contractId,
        status: contract.status,
    });
    return c.json({ ok: true, matrixEventId: result.matrixEventId });
});

splitContracts.get('/:spaceId', async (c) => {
    if (!internalSecretValid(c.req.header('x-bmc-internal-secret'))) {
        return c.json({ error: 'unauthorized' }, 401);
    }
    const spaceId = c.req.param('spaceId');
    const contracts = await listSplitContracts(spaceId);
    return c.json({
        contracts: contracts.filter((entry) => isSplitContractPayload(entry.contract)),
    });
});

export default splitContracts;
