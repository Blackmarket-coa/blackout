/**
 * Social-graph export: the connections a user has built, as distinct from the
 * messages they sent (Matrix, and mostly not the server's to give — see
 * `index.ts`) and from their balances (`ledgerExport.ts`).
 *
 * Two honesty constraints shape this module.
 *
 * **Durability.** Follows and profiles are process-memory only today
 * (`services/follows.ts:1-11`, `services/profileStore.ts`), so they reset on
 * restart. An export that silently returned `[]` for them would read as "you
 * have no connections" when the truth is "the server forgot". Every section
 * therefore carries a `durability` marker, and `warnings` names the affected
 * sections in the payload itself.
 *
 * **Other people's data.** A social graph is shared by construction: your
 * follower list is also a list of other people. Blackout exports the edges the
 * user created (who *they* follow, invitations *they* issued) in full, and
 * reduces inbound edges to counts. Handing someone a list of everyone who
 * follows them is a small privacy leak dressed up as data portability.
 */

import { db } from '../../db/store';
import { followCounts, listFollowing } from '../follows';
import { getProfile, listWallPosts } from '../profileStore';

export type Durability = 'persisted' | 'process-memory';

export interface SocialGraphExport {
    follows: {
        durability: Durability;
        /** Edges this user created. */
        following: Array<{ followeeId: string; createdAt: string }>;
        /**
         * Inbound edges are counted, not listed: naming every follower would
         * export other people's associations, not the user's own.
         */
        followerCount: number;
    };
    profile: {
        durability: Durability;
        /** Null when the user never customized a profile. */
        profile: unknown | null;
        wallPosts: Array<{ id: string; authorId: string; body: string; createdAt: string }>;
    };
    invitations: {
        durability: Durability;
        issued: Array<{
            id: string;
            label: string | null;
            createdAt: string;
            expiresAt: string | null;
            redemptionCount: number;
        }>;
    };
    rings: {
        durability: Durability;
        memberships: Array<{ ringId: string; role: string; createdAt: string }>;
    };
    /** Named gaps, stated in the payload so an export read alone is not misleading. */
    warnings: string[];
}

const PROCESS_MEMORY_WARNING =
    'The `follows` and `profile` sections are held in server process memory and reset when the API restarts. An empty result there means the server has no current record, not necessarily that you have no connections. Persisting them is tracked work.';

const SHARED_DATA_NOTE =
    "Inbound relationships (your followers) are exported as a count rather than a list, because naming them would export other people's data alongside yours.";

export function collectSocialGraphExport(userId: string): SocialGraphExport {
    const warnings = [PROCESS_MEMORY_WARNING, SHARED_DATA_NOTE];

    const issued = db.listInvitationTokensByCreator(userId, { limit: Number.MAX_SAFE_INTEGER });

    return {
        follows: {
            durability: 'process-memory',
            following: listFollowing(userId).map((edge) => ({
                followeeId: edge.followeeId,
                createdAt: edge.createdAt,
            })),
            followerCount: followCounts(userId).followers,
        },
        profile: {
            durability: 'process-memory',
            profile: getProfile(userId),
            wallPosts: listWallPosts(userId).map((post) => ({
                id: post.id,
                authorId: post.authorId,
                body: post.body,
                createdAt: post.createdAt,
            })),
        },
        invitations: {
            durability: 'persisted',
            issued: issued.map((token) => ({
                id: token.id,
                label: token.label ?? null,
                createdAt: token.createdAt,
                expiresAt: token.expiresAt ?? null,
                // The redemption rows name who accepted; only the count is the
                // exporting user's own data.
                redemptionCount: db.listInvitationRedemptionsByToken(token.id).length,
            })),
        },
        rings: {
            durability: 'persisted',
            memberships: db
                .listRingMemberships()
                .filter((membership) => membership.userId === userId)
                .map((membership) => ({
                    ringId: membership.ringId,
                    role: membership.role,
                    createdAt: membership.createdAt,
                })),
        },
        warnings,
    };
}
