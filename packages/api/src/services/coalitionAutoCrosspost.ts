/**
 * Cross-posting that does not wait for a person to press share.
 *
 * The manual path needs a member with `campaigns.promote` to notice something
 * happened and act on it, which means a coalition's reach is bounded by whoever
 * happens to be looking. This sweep closes that gap: when a campaign reaches a
 * milestone, the coalition's own connected accounts say so.
 *
 * Four things define its shape, and each is a deliberate narrowing:
 *
 *  1. **The coalition posts, never a member.** Only `authMode: 'shared'`
 *     connections are used — an account a steward connected on the coalition's
 *     behalf and that the coalition can be held responsible for. Automating a
 *     member's personal account would mean posting as a person who is not in
 *     the room, which is a consent problem before it is a terms-of-service one.
 *     Members keep the manual share sheet, unchanged.
 *
 *  2. **Milestones, not a timer.** Three moments with actual news in them. A
 *     schedule posting every N hours says nothing new and teaches followers to
 *     mute the account. Each milestone posts once per platform, ever, enforced
 *     by a unique index rather than by a cursor this code would have to keep
 *     correct.
 *
 *  3. **No automated fundraising solicitation.** Campaign types that ask for
 *     money are excluded here, and the exclusion is the point rather than an
 *     oversight: a person pressing share is one person soliciting, while a
 *     scheduler posting to every connected platform on a timer is a platform
 *     conducting continuous multi-jurisdiction charitable solicitation — which
 *     carries registration requirements this project has not met. Those
 *     campaigns still cross-post the moment a member chooses to.
 *
 *  4. **Every gate the manual path has.** Stopped coalitions, unlisted
 *     mutual-aid subjects, the outbound flag, inactive connections. The
 *     automation is higher-volume and unattended, so it gets the strictest
 *     reading of each, never a looser one.
 */
import {
    COALITION_PLATFORM_CAPABILITIES,
    platformCanAutomate,
    type CampaignMilestone,
    type CoalitionPlatform,
} from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionCampaignRecord, CoalitionRecord } from '../db/types';
import { log } from '../telemetry/logger';
import { emitDomainEvent } from '../modules/domain-events';
import { isStopped } from './coalitionNetworkStore';
import {
    campaignIsPubliclyShareable,
    composePost,
    newCampaignPostId,
    outboundSyncEnabled,
    type PlatformPoster,
} from './coalitionSync';
import { postToPlatform, sharedCredentialAad } from './coalitionPlatformAdapters';
import { withAttribution } from './coalitionAttribution';

/**
 * Campaign types the automation will announce.
 *
 * `drive`, `goods_drive` and `mutual_aid` are excluded: all three ask the
 * public for money or goods, and `composePost` puts the dollar goal in the text.
 * Widening this list is a legal question, not a product one — see rule 3 above.
 */
const ANNOUNCEABLE_TYPES = new Set(['project', 'boost']);

/** Master switch, separate from the manual cross-post gate. */
export const autoCrosspostEnabled = (): boolean =>
    process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED === '1' ||
    process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED?.toLowerCase() === 'true';

/**
 * How long after a campaign becomes active its launch is still news.
 *
 * Without this, switching the feature on would announce the entire back
 * catalogue at once — every campaign ever launched, to every connected
 * platform, in one tick. That is the single most likely way to get a
 * coalition's accounts suspended on day one.
 */
const LAUNCH_WINDOW_MS = 48 * 60 * 60 * 1000;

/** What this campaign has reached that is worth saying, newest first. */
export function milestonesFor(campaign: CoalitionCampaignRecord, now: number): CampaignMilestone[] {
    const reached: CampaignMilestone[] = [];
    if (campaign.status === 'completed') reached.push('completed');
    if (
        campaign.goalCents &&
        campaign.goalCents > 0 &&
        (campaign.raisedCents ?? 0) >= campaign.goalCents
    ) {
        reached.push('goal_reached');
    }
    if (campaign.status === 'active') {
        const startedAt = Date.parse(campaign.startsAt ?? campaign.createdAt);
        if (Number.isFinite(startedAt) && now - startedAt <= LAUNCH_WINDOW_MS) {
            reached.push('launched');
        }
    }
    return reached;
}

const MILESTONE_COPY: Record<CampaignMilestone, string> = {
    launched: 'just started',
    goal_reached: 'reached its goal for',
    completed: 'finished',
};

/**
 * The announcement text.
 *
 * Built from `composePost` so the link, the truncation rule and the campaign
 * URL stay identical to the manual path — there is one place that decides what
 * a coalition's post looks like — with the verb swapped for the milestone.
 */
export function composeMilestonePost(
    coalition: CoalitionRecord,
    campaign: CoalitionCampaignRecord,
    milestone: CampaignMilestone
): { text: string; url: string } {
    const base = composePost(coalition, campaign);
    // `auto` rather than the platform name: the channel says how the link was
    // sent, and an automated post has no sharer to credit. A coalition can then
    // tell what its own account earned from what its members earned.
    const url = withAttribution(base.url, { campaignId: campaign.id, channel: 'auto' });
    return {
        text: `${coalition.name} ${MILESTONE_COPY[milestone]} ${campaign.title}. ${url}`,
        url,
    };
}

/** Already announced? The post row is the record; there is no separate cursor. */
function alreadyPosted(
    campaignId: string,
    platform: CoalitionPlatform,
    milestone: CampaignMilestone
): boolean {
    return db.listCoalitionCampaignPosts({ campaignId }).some(
        (row) =>
            row.platform === platform &&
            row.milestone === milestone &&
            // A failed attempt is not a record of having announced it. The
            // next sweep retries; the unique index still stops a duplicate
            // once one succeeds.
            row.syncStatus !== 'failed'
    );
}

export interface AutoCrosspostResult {
    considered: number;
    posted: number;
    failed: number;
    skipped: number;
}

let poster: PlatformPoster = postToPlatform;

/** Test seam: stand in for the network without registering a global adapter. */
export function __setAutoPosterForTests(next: PlatformPoster | null): void {
    poster = next ?? postToPlatform;
}

/**
 * One pass over every campaign, announcing what has newly happened.
 *
 * Never throws: a sweep that dies on one bad row stops announcing for everyone.
 */
export async function sweepAutoCrossposts(now = Date.now()): Promise<AutoCrosspostResult> {
    const result: AutoCrosspostResult = { considered: 0, posted: 0, failed: 0, skipped: 0 };
    if (!autoCrosspostEnabled() || !outboundSyncEnabled()) return result;

    for (const coalition of db.listCoalitions()) {
        if (isStopped(coalition)) continue;

        const connections = db.listCoalitionConnections(coalition.id).filter(
            (row) =>
                row.active &&
                // The coalition's own account only. A member's personal
                // connection is never driven unattended.
                row.authMode === 'shared' &&
                row.credentialRef &&
                platformCanAutomate(row.platform)
        );
        if (connections.length === 0) continue;

        for (const campaign of db.listCoalitionCampaigns({ coalitionId: coalition.id })) {
            if (!ANNOUNCEABLE_TYPES.has(campaign.type)) continue;
            // The same privacy gate the manual path and the OG card apply.
            if (!campaignIsPubliclyShareable(campaign)) continue;

            const milestones = milestonesFor(campaign, now);
            if (milestones.length === 0) continue;

            // Newest first, and only the newest: announcing "launched" and
            // "reached its goal" in the same tick is two posts about one thing.
            const milestone = milestones[0];
            result.considered += 1;

            for (const connection of connections) {
                if (alreadyPosted(campaign.id, connection.platform, milestone)) {
                    result.skipped += 1;
                    continue;
                }
                const post = composeMilestonePost(coalition, campaign, milestone);
                const id = newCampaignPostId();
                let outcome: { ok: boolean; externalPostId?: string; error?: string };
                try {
                    outcome = await poster({
                        platform: connection.platform,
                        text: post.text,
                        url: post.url,
                        credentialRef: connection.credentialRef ?? null,
                        credentialAad: sharedCredentialAad(coalition.id, connection.platform),
                    });
                } catch (error) {
                    outcome = {
                        ok: false,
                        error: error instanceof Error ? 'transport' : 'unknown',
                    };
                }

                db.upsertCoalitionCampaignPost({
                    id,
                    campaignId: campaign.id,
                    coalitionId: coalition.id,
                    platform: connection.platform,
                    direction: 'out',
                    syncStatus: outcome.ok ? 'posted' : 'failed',
                    milestone,
                    // No author: the coalition posted this, not a person. A
                    // member id here would attribute an unattended act to
                    // whoever last touched the connection.
                    ...(outcome.externalPostId ? { externalPostId: outcome.externalPostId } : {}),
                    ...(outcome.error ? { error: outcome.error } : {}),
                });

                if (outcome.ok) {
                    result.posted += 1;
                    emitDomainEvent({
                        module: 'coalitions',
                        type: 'coalition.campaign.announced',
                        payload: {
                            coalitionId: coalition.id,
                            campaignId: campaign.id,
                            platform: connection.platform,
                            milestone,
                        },
                    });
                } else {
                    result.failed += 1;
                    // The error code, never the credential and never the text.
                    log.warn('coalition_autopost_failed', {
                        coalitionId: coalition.id,
                        campaignId: campaign.id,
                        platform: connection.platform,
                        milestone,
                        error: outcome.error ?? 'unknown',
                    });
                }
            }
        }
    }

    if (result.posted || result.failed) {
        log.info('coalition_autopost_sweep', { ...result });
    }
    return result;
}

/** Platforms this deployment could actually announce to, for the settings UI. */
export function automatablePlatforms(): CoalitionPlatform[] {
    return (Object.keys(COALITION_PLATFORM_CAPABILITIES) as CoalitionPlatform[]).filter(
        platformCanAutomate
    );
}
