/**
 * The disclosure a person reads and agrees to before using public geocaches
 * (docs/coalitions/GEOCACHING_DESIGN.md §3). Shared by the client, which shows
 * it, and the API, which records an agreement only when the SHA-256 of
 * {@link cacheDisclosureText} matches the text it expects for this version.
 *
 * Every sentence must stay true of what the code does
 * (docs/security/coalition-caches-2026-11-22.md). Change the wording only
 * together with the behaviour it describes, and raise the version: everyone
 * who agreed to the old wording is then asked again.
 */
export const CACHE_DISCLOSURE = {
    kind: 'coalition-caches',
    version: 1,
    title: 'Public caches: what you share',
    summary:
        'A cache is a photo and a note you leave at a real place for others to find. Read this before you place or look for one.',
    sections: [
        {
            heading: 'Who can use this',
            points: [
                'Caches are for people 18 and older.',
                'Blackout does not check your age. By agreeing, you are telling us you are 18 or older.',
            ],
        },
        {
            heading: 'When you place a public cache',
            points: [
                "Blackout's server keeps the exact spot you choose, your title, hint and note, the photo, and that you placed it.",
                'Other members see it from 2 to 3 hours after you place it, so it does not show where you are right now.',
                'They see an area about 70 m across, not the exact spot, and they are not shown who placed it or when.',
                'Anyone who goes to that area can work out that someone was there.',
                "The photo's hidden location data is removed before it is uploaded. A photo the app cannot clean is not uploaded.",
                "This server's administrators can see the exact spot and who placed it, so they can handle reports.",
                'Some places, such as homes, schools, shelters and clinics, cannot hold a cache. If you place one there, it will not appear to others, and the app will not tell you.',
            ],
        },
        {
            heading: 'When you find one',
            points: [
                'A find records that you found it and when, never where you were.',
                'If a cache asks for a GPS check-in, your position is sent once, in the body of the request, compared with the area everyone is shown, and not kept or logged. GPS can be faked, so a GPS find proves little.',
                'Anything that reads your connection on the way, including Cloudflare in front of this service, can see the request as it passes.',
            ],
        },
        {
            heading: 'Reports',
            points: [
                'If someone reports a cache, it is hidden from everyone but its placer until an administrator looks at it.',
            ],
        },
        {
            heading: 'How long it is kept, and how to stop',
            points: [
                'Your caches stay until you take them down, an administrator removes them, or you delete your account. Deleting your account erases them, your finds, your reports and this agreement.',
                'You can withdraw this agreement in Settings at any time. You can still take down what you placed.',
            ],
        },
    ],
} as const;

/**
 * The exact text the agreement covers: the title, the summary, then each
 * section's heading and points, one per line, sections separated by a blank
 * line. Both the client and the API hash this string (UTF-8, SHA-256).
 */
export function cacheDisclosureText(
    disclosure: typeof CACHE_DISCLOSURE = CACHE_DISCLOSURE
): string {
    return [
        disclosure.title,
        disclosure.summary,
        ...disclosure.sections.map((section) => [section.heading, ...section.points].join('\n')),
    ].join('\n\n');
}
