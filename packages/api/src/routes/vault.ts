import { Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { writeRateLimit } from '../middleware/rate-limit';
import { db } from '../db/store';
import type { VaultItemRecord } from '../db/types';

/**
 * Encrypted personal vault. The server is a dumb store of opaque,
 * client-encrypted blobs — it never receives or holds plaintext or keys. Every
 * route is strictly owner-scoped.
 */
const vault = new Hono();
vault.use('*', writeRateLimit);

const MAX_BLOB = 64 * 1024; // 64 KiB of base64 ciphertext per item.

const createSchema = z.object({
    label: z.string().min(1).max(160),
    ciphertext: z.string().min(1).max(MAX_BLOB),
    iv: z.string().min(1).max(512),
    algo: z.string().min(1).max(32).optional(),
});

const updateSchema = z.object({
    label: z.string().min(1).max(160).optional(),
    ciphertext: z.string().min(1).max(MAX_BLOB).optional(),
    iv: z.string().min(1).max(512).optional(),
    algo: z.string().min(1).max(32).optional(),
});

function toView(record: VaultItemRecord) {
    return {
        id: record.id,
        label: record.label,
        ciphertext: record.ciphertext,
        iv: record.iv,
        algo: record.algo,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

vault.get('/items', (c) => {
    const user = requireUser(c, 'Sign in to access your vault');
    if (user instanceof Response) return user;
    return c.json({ items: db.listVaultItemsForOwner(user.sub).map(toView) });
});

const vaultMaxItems = Number.parseInt(process.env.VAULT_MAX_ITEMS_PER_USER ?? '', 10) || 50;

vault.post('/items', async (c) => {
    const user = requireUser(c, 'Sign in to add a vault item');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createSchema);
    if (parsed instanceof Response) return parsed;

    const existing = db.listVaultItemsForOwner(user.sub);
    if (existing.length >= vaultMaxItems) {
        return c.json({ code: 'vault_full', message: `Vault is full (${vaultMaxItems} items max)` }, 409);
    }
    const record = db.createVaultItem({
        id: crypto.randomUUID(),
        ownerUserId: user.sub,
        label: parsed.label,
        ciphertext: parsed.ciphertext,
        iv: parsed.iv,
        algo: parsed.algo ?? 'AES-GCM',
    });
    return c.json({ item: toView(record) }, 201);
});

vault.put('/items/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a vault item');
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    const existing = db.getVaultItem(id);
    if (!existing || existing.ownerUserId !== user.sub) {
        return c.json({ code: 'not_found', message: 'No vault item with that id.' }, 404);
    }
    const parsed = await readJsonBody(c, updateSchema);
    if (parsed instanceof Response) return parsed;
    const updated = db.updateVaultItem(id, parsed);
    return c.json({ item: updated ? toView(updated) : null });
});

vault.delete('/items/:id', (c) => {
    const user = requireUser(c, 'Sign in to delete a vault item');
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    const existing = db.getVaultItem(id);
    if (!existing || existing.ownerUserId !== user.sub) {
        return c.json({ code: 'not_found', message: 'No vault item with that id.' }, 404);
    }
    db.deleteVaultItem(id);
    return c.json({ ok: true });
});

export default vault;
