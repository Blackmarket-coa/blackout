import { getMxIdLocalPart } from '../../utils/matrix';

/**
 * Resolve a human-friendly label for a profile whose `displayName` may be empty.
 *
 * The self-profile now starts blank and is hydrated from Matrix
 * (`SelfProfileHydrator`); during the brief pre-hydration window — or when a
 * Matrix account has no display name set — `displayName` can be empty. Fall back
 * to the user id's local part, then to a generic 'You', so avatars/nameplates
 * never render blank or compute initials/colours from an empty string.
 */
export const profileDisplayLabel = (profile: { displayName?: string; userId: string }): string => {
    const name = profile.displayName?.trim();
    if (name) return name;
    const localPart = getMxIdLocalPart(profile.userId);
    if (localPart) return localPart;
    return 'You';
};

/**
 * "Member since March 2026" label from the server-stamped `memberSince`
 * timestamp. Month + year only — the exact day is noise on a profile card.
 * Returns null for absent/invalid values so callers can skip the row entirely
 * (profiles that pre-date the stamp have no memberSince).
 */
export const formatMemberSince = (memberSince: string | undefined): string | null => {
    if (!memberSince) return null;
    const parsed = Date.parse(memberSince);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
    });
};
