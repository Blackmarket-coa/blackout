import type { BountyCategory } from '@blackout/core';

/** Display labels for bounty categories on the Blackout-home board. */
export const BOUNTY_CATEGORY_LABELS: Record<BountyCategory, string> = {
    creator: 'Creator',
    coalition: 'Coalition',
    developer: 'Developer',
    tester: 'Tester',
    content: 'Content',
};
