import { BMC_PROFILE_EVENT_TYPE, type BmcProfileEvent, type ProfileConnection } from './profileTypes';

/**
 * The public creator profile (theblackout.app/@handle) is served zero-auth by a
 * Synapse module that reads the `co.bmc.profile` *Matrix account data* event. The
 * in-app profile editor, however, persists to the server profile store via
 * `PUT /v1/profile`, which is auth-gated and therefore invisible to the public
 * page. To keep the public profile in lock-step with profile edits, every write
 * path mirrors its slice into this account data event.
 *
 * Two writers share the event and must not clobber each other:
 *   - the profile editor owns identity/content fields (bio, banner, pronouns,
 *     non-FBM connections, cosmetics, …);
 *   - public settings own the publish gate + monetization links (`public`,
 *     `sponsors`, and the `fbm` connection).
 *
 * Both helpers below do a read-merge-write that only touches their own fields.
 */

type AccountDataClient = {
    getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
};

const asAccountData = (mx: unknown): AccountDataClient => mx as AccountDataClient;

export const readPublicProfileAccountData = (mx: unknown): BmcProfileEvent => {
    const content = asAccountData(mx).getAccountData(BMC_PROFILE_EVENT_TYPE)?.getContent();
    return content && typeof content === 'object' ? (content as BmcProfileEvent) : {};
};

const dropUndefined = (event: BmcProfileEvent): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
};

/**
 * Mirror the editor-owned profile fields into account data, preserving the
 * publish gate, sponsors, and the FBM connection that public settings manage.
 */
export async function mirrorProfileToAccountData(
    mx: unknown,
    profileEvent: BmcProfileEvent
): Promise<void> {
    const current = readPublicProfileAccountData(mx);
    const fbmConnection = (current.connections ?? []).find((conn) => conn.type === 'fbm');
    const editorConnections = (profileEvent.connections ?? []).filter((conn) => conn.type !== 'fbm');
    const connections: ProfileConnection[] = [
        ...editorConnections,
        ...(fbmConnection ? [fbmConnection] : []),
    ];
    const next: BmcProfileEvent = {
        ...current,
        ...profileEvent,
        connections,
        // Publish state is owned by public settings — never changed by an edit.
        public: current.public,
        sponsors: current.sponsors,
    };
    await asAccountData(mx).setAccountData(BMC_PROFILE_EVENT_TYPE, dropUndefined(next));
}

/**
 * Write the public-settings-owned fields (publish gate, sponsors, FBM link)
 * into account data, preserving all editor-owned identity/content fields.
 */
export async function writePublicProfileSettings(
    mx: unknown,
    opts: { isPublic: boolean; sponsors: string[]; fbmHandle: string }
): Promise<void> {
    const current = readPublicProfileAccountData(mx);
    const trimmedFbm = opts.fbmHandle.trim();
    const connections: ProfileConnection[] = [
        ...(current.connections ?? []).filter((conn) => conn.type !== 'fbm'),
    ];
    if (trimmedFbm) {
        connections.push({
            type: 'fbm',
            username: trimmedFbm,
            url: `https://freeblackmarket.com/${trimmedFbm}`,
            label: 'FreeBlackMarket',
        });
    }
    const next: BmcProfileEvent = {
        ...current,
        public: opts.isPublic,
        connections,
        sponsors: opts.sponsors.length > 0 ? opts.sponsors : undefined,
    };
    await asAccountData(mx).setAccountData(BMC_PROFILE_EVENT_TYPE, dropUndefined(next));
}
