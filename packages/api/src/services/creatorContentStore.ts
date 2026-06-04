import type { ContentDistribution, CreatorContent, DistributionTarget } from '@blackout/core';
import { db } from '../db/store';

const rand = () => `${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

export function newContentId(): string {
    return `cnt_${rand()}`;
}
export function newDistributionId(): string {
    return `dist_${rand()}`;
}

export function listContent(
    filter: { creatorId?: string; status?: CreatorContent['status'] } = {},
): CreatorContent[] {
    return db.listCreatorContent(filter);
}

export function getContent(id: string): CreatorContent | null {
    return db.getCreatorContent(id) ?? null;
}

export function createContent(input: Parameters<typeof db.createCreatorContent>[0]): CreatorContent {
    return db.createCreatorContent(input);
}

export function updateContent(
    id: string,
    patch: Parameters<typeof db.updateCreatorContent>[1],
): CreatorContent | null {
    return db.updateCreatorContent(id, patch) ?? null;
}

export function listDistributions(contentId: string): ContentDistribution[] {
    return db.listContentDistributions({ contentId });
}

export function addDistribution(input: {
    contentId: string;
    target: DistributionTarget;
    targetId?: string;
}): ContentDistribution {
    return db.addContentDistribution({ id: newDistributionId(), ...input });
}

/**
 * Publish a piece of content: flip it to `published`, stamp `publishedAt`, and
 * guarantee a Home-feed distribution so the published item always surfaces on
 * the unified feed (the creator can add Coliseum/Coalition/Den targets too).
 */
export function publishContent(id: string): CreatorContent | null {
    const content = db.updateCreatorContent(id, {
        status: 'published',
        publishedAt: new Date().toISOString(),
    });
    if (!content) return null;
    const existing = db.listContentDistributions({ contentId: id });
    if (!existing.some((dist) => dist.target === 'home')) {
        db.addContentDistribution({ id: newDistributionId(), contentId: id, target: 'home' });
    }
    return content;
}

/** Auto-publish any scheduled content whose scheduledFor has passed. */
export function publishDueScheduledContent(asOf?: string): number {
    const due = db.listDueScheduledContent(asOf);
    for (const content of due) publishContent(content.id);
    return due.length;
}

/** Recently published content distributed to the Home feed, newest first. */
export function listHomeContentFeed(limit = 30): CreatorContent[] {
    const homeContentIds = new Set(
        db.listContentDistributions({}).filter((d) => d.target === 'home').map((d) => d.contentId),
    );
    return db
        .listCreatorContent({ status: 'published' })
        .filter((content) => homeContentIds.has(content.id))
        .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
        .slice(0, limit);
}
