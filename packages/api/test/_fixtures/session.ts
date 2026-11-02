/**
 * A signed test session whose subject has an account row.
 *
 * Every session token the API mints is for an account the minting process
 * holds: `/register`, `/matrix/exchange` and the OIDC login create the user
 * before `issueSession`, and `/login` and `/token/refresh` look it up first
 * (`src/routes/auth.ts`, `src/routes/auth-oidc.ts`). A test that signs a token
 * for a literal subject with no `users` row exercises a caller production
 * cannot produce, and a check that refuses a token whose account is gone
 * would refuse it. These helpers give the subject the row first.
 *
 * `ensureUser` creates the row only when the id has none, so a test that has
 * already created the account (or calls this once per request) keeps the row
 * it has. Usernames are not checked for uniqueness, as the memory store does
 * not check them: two subjects signed with one username get one row each.
 *
 * Pass the store the app under test reads (usually the `db` singleton from
 * `src/db/store`, imported after the test file has set its environment).
 *
 * A test file that sets no `BLACKOUT_DB_MODE` runs on the file store, which
 * saves the seeded row to `.blackout/data/store.json` under the working
 * directory and loads it again when the next test process boots. So a run
 * meant to show that a test needs this seeding (the row left out) must start
 * without that directory: otherwise a row an earlier run saved can still be
 * there, and the test passes without the seeding.
 *
 * A test that signs for an account that is gone on purpose (the route's own
 * answer to a deleted account is what it checks) signs with `signJwt` and does
 * not call these.
 */
import type { UserRecord } from '../../src/db/types';
import { signJwtWithMeta } from '../../src/services/auth';

export interface AccountStore {
    getUserById(id: string): UserRecord | undefined;
    createUser(input: Omit<UserRecord, 'createdAt'>): UserRecord;
}

/**
 * The username a seeded row gets when the caller names none: `u-` and the id's
 * first 24 ASCII letters and digits, or `u-user` when it has none. 24 is long
 * enough that ids sharing a long prefix (`blackout-user-uuid-1` and `-3`; 12
 * would give both `u-blackoutuser`) still get different names, as Postgres's
 * UNIQUE `users.username` would need. Every call in the suite passes the
 * username its token carries, so this is only a fallback.
 */
const defaultUsername = (id: string): string =>
    `u-${id.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'user'}`;

export function ensureUser(db: AccountStore, id: string, username?: string): string {
    if (!db.getUserById(id)) {
        db.createUser({
            id,
            username: username ?? defaultUsername(id),
            passwordHash: '',
            reputationScore: 0,
            reputationTier: 'member',
            pubkeyEd25519: 'pk',
        });
    }
    return id;
}

/** `signJwt(id, username, ttlSeconds)` for a subject that has an account row. */
export function sessionFor(
    db: AccountStore,
    id: string,
    username?: string,
    ttlSeconds?: number
): string {
    ensureUser(db, id, username);
    return signJwtWithMeta(id, username ?? db.getUserById(id)!.username, ttlSeconds).token;
}
