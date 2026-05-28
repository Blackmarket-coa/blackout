/**
 * Model for purchasable vault goods (Workstream 5 / security). A `vault_item`
 * entitlement grants either extra vault capacity (`slot`) or a starter
 * `template` the user can add to their encrypted vault. Dependency-free so the
 * installer and atoms can import it.
 */

export type VaultKind = 'slot' | 'template';

export interface OwnedVaultGrant {
    id: string;
    name: string;
    vaultKind: VaultKind;
    /** For templates: the suggested entry label the user will encrypt a value into. */
    templateLabel?: string;
    /** For slot grants: how many extra vault slots this entitlement adds. */
    slots?: number;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const VAULT_KINDS: readonly VaultKind[] = ['slot', 'template'];

function str(value: unknown, max: number): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, max)
        : undefined;
}

/** Parse + sanitize an untrusted vault_item payload. */
export function parseOwnedVaultGrant(payload: unknown): OwnedVaultGrant | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;
    const vaultKind = data.vaultKind;
    if (typeof vaultKind !== 'string' || !VAULT_KINDS.includes(vaultKind as VaultKind)) {
        return null;
    }
    const id =
        typeof data.id === 'string' && ID_RE.test(data.id)
            ? data.id
            : str(data.name, 64)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const name = str(data.name, 80) ?? id;
    if (!id || !name) return null;

    const grant: OwnedVaultGrant = { id, name, vaultKind: vaultKind as VaultKind };
    if (grant.vaultKind === 'template') {
        grant.templateLabel = str(data.templateLabel, 160) ?? name;
    } else {
        const slots = typeof data.slots === 'number' && data.slots > 0 ? Math.floor(data.slots) : 1;
        grant.slots = Math.min(slots, 100);
    }
    return grant;
}
