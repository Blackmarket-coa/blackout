/**
 * Who may read a profile wall.
 *
 * The rule already existed in the client (`features/profile/ProfileWall.tsx`),
 * but only there — so the server happily handed wall content to anyone who
 * asked, and the Circle feed pushed posts from `private` and `friends` walls
 * out to the author's followers. Hoisting it here gives both sides one
 * implementation to agree on.
 *
 * Note the asymmetry this protects: a wall post is written by one person *onto
 * someone else's wall*, so the setting that governs it belongs to the wall's
 * owner, not to its author. Following the author grants nothing.
 */

export type WallVisibility = 'public' | 'friends' | 'private';

export interface WallVisibilitySettings {
    visibility: WallVisibility;
}

/**
 * `viewerConnected` means the viewer and the wall's owner have overlapping
 * circles — the Circle-era reading of the old "friends" setting, and the same
 * two-sided consent the Circle map requires.
 */
export function canViewWall(input: {
    settings: WallVisibilitySettings | undefined;
    ownerId: string;
    viewerId: string | null | undefined;
    viewerConnected: boolean;
}): boolean {
    const visibility = input.settings?.visibility ?? 'public';
    if (visibility === 'public') return true;
    if (!input.viewerId) return false;
    if (input.viewerId === input.ownerId) return true;
    if (visibility === 'friends') return input.viewerConnected;
    return false;
}
