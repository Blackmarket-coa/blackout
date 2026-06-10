import { describe, expect, it } from 'vitest';
import {
    derivePersonaAlias,
    generatePersonaRootKey,
    personaRootKeyCommitment,
} from '@blackout/protocol';

const ROOT = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const OTHER_ROOT = new Uint8Array(32).map((_, i) => (i * 11 + 1) & 0xff);

describe('derivePersonaAlias', () => {
    it('is deterministic for identical inputs', async () => {
        const a = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        const b = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        expect(a).toBe(b);
        expect(a).toMatch(/^@p-[a-z2-7]+$/);
    });

    it('differs per conversation', async () => {
        const a = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        const b = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-2', epoch: 0 });
        expect(a).not.toBe(b);
    });

    it('rotates with the epoch', async () => {
        const e0 = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        const e1 = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 1 });
        expect(e0).not.toBe(e1);
    });

    it('yields disjoint alias spaces per compartment', async () => {
        const base = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        const work = await derivePersonaAlias({
            rootKey: ROOT,
            conversationId: 'room-1',
            epoch: 0,
            compartmentId: 'work',
        });
        const activism = await derivePersonaAlias({
            rootKey: ROOT,
            conversationId: 'room-1',
            epoch: 0,
            compartmentId: 'activism',
        });
        expect(new Set([base, work, activism]).size).toBe(3);
    });

    it('differs per root key', async () => {
        const a = await derivePersonaAlias({ rootKey: ROOT, conversationId: 'room-1', epoch: 0 });
        const b = await derivePersonaAlias({ rootKey: OTHER_ROOT, conversationId: 'room-1', epoch: 0 });
        expect(a).not.toBe(b);
    });

    it('rejects malformed root keys and epochs', async () => {
        await expect(
            derivePersonaAlias({ rootKey: new Uint8Array(16), conversationId: 'r', epoch: 0 })
        ).rejects.toThrow(/32 bytes/);
        await expect(
            derivePersonaAlias({ rootKey: ROOT, conversationId: 'r', epoch: -1 })
        ).rejects.toThrow(/epoch/);
    });
});

describe('persona root key', () => {
    it('generates 32 random bytes with a stable hex commitment', async () => {
        const key = generatePersonaRootKey();
        expect(key.length).toBe(32);
        const c1 = await personaRootKeyCommitment(key);
        const c2 = await personaRootKeyCommitment(key);
        expect(c1).toBe(c2);
        expect(c1).toMatch(/^[0-9a-f]{64}$/);
    });
});
