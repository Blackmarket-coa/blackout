import {
    AID_POST_CATEGORIES,
    AID_POST_STATUS,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    SELLER_LOCATION_TYPES,
    SPATIAL_LAYER_KEYS,
    countActiveMembers,
    deriveDisplayStatus,
    nextOccurrence,
    summarizeRsvps,
    type AidPost,
    type CoalitionEvent,
    type CoalitionFeedItem,
    type RsvpSummary,
    type SellerLocation,
    type SpatialFeedItem,
} from '@blackout/core';
import { db } from '../db/store';

const NOW_ISO = () => new Date().toISOString();

export interface FeedFilter {
    canopyId?: string;
    denId?: string;
    kind?: CoalitionFeedItem['kind'];
}

export function listFeedItems(filter: FeedFilter = {}): CoalitionFeedItem[] {
    return db.listCoalitionFeedItems(filter);
}

export function saveFeedItem(
    input: Parameters<typeof db.upsertCoalitionFeedItem>[0]
): CoalitionFeedItem {
    return db.upsertCoalitionFeedItem(input);
}

export function newFeedItemId(): string {
    return `feed_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function getFeedItem(id: string) {
    return db.getCoalitionFeedItem(id);
}

/**
 * Attach the canopy den that backs a feed item's discussion.
 *
 * Mirrors `linkTopicDiscussionDen`: the den is created client-side and lazily,
 * and the first link wins so two simultaneous commenters can't leave the item
 * with two rival discussions.
 *
 * Returns null when the feed item does not exist.
 */
export function linkFeedItemDen(feedItemId: string, discussionDenId: string) {
    const item = db.getCoalitionFeedItem(feedItemId);
    if (!item) return null;
    if (item.discussionDenId) {
        return { item, created: false };
    }
    const updated = { ...item, discussionDenId };
    db.upsertCoalitionFeedItem(updated);
    return { item: updated, created: true };
}

export function listFeedLikes(feedItemId: string) {
    return db.listCoalitionFeedLikes(feedItemId);
}

export function saveFeedLike(input: Parameters<typeof db.upsertCoalitionFeedLike>[0]) {
    return db.upsertCoalitionFeedLike(input);
}

export function listFeedComments(feedItemId: string) {
    return db.listCoalitionFeedComments(feedItemId);
}

export function createFeedComment(input: Parameters<typeof db.createCoalitionFeedComment>[0]) {
    return db.createCoalitionFeedComment(input);
}

export function newFeedLikeId(): string {
    return `flike_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function newFeedCommentId(): string {
    return `fcmt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export interface SpatialFilter {
    layers?: string[];
    canopyId?: string;
}

/** Project a scheduled event onto its map pin using its soonest live/upcoming occurrence. */
function eventToSpatialItem(event: CoalitionEvent, nowMs: number): SpatialFeedItem {
    const occ = nextOccurrence(event, nowMs);
    return {
        id: `event:${event.id}`,
        layer: 'events',
        title: event.title,
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        visibility: event.visibility,
        eventType: 'community_event',
        startsAt: occ?.startsAt ?? event.startsAt,
        endsAt: occ?.endsAt ?? event.endsAt,
        status: occ?.status ?? 'past',
        denId: event.denId,
        source: 'blackout',
        meta: { eventId: event.id, category: event.category },
    };
}

export function listSpatialItems(filter: SpatialFilter = {}): SpatialFeedItem[] {
    const allowed = new Set(
        filter.layers && filter.layers.length > 0
            ? filter.layers.filter((key) => (SPATIAL_LAYER_KEYS as readonly string[]).includes(key))
            : SPATIAL_LAYER_KEYS
    );
    const items: SpatialFeedItem[] = db
        .listCoalitionSpatialItems()
        .filter((item) => allowed.has(item.layer));
    if (allowed.has('events')) {
        const now = Date.now();
        for (const event of db.listCoalitionEvents()) {
            if (event.status === 'cancelled') continue;
            items.push(eventToSpatialItem(event, now));
        }
    }
    if (allowed.has('communities')) {
        const nowIso = NOW_ISO();
        const memberships = db.listRingMemberships();
        for (const ring of db.listCoalitionRings()) {
            if (!ring.location || ring.visibility !== 'public') continue;
            const memberCount = countActiveMembers(memberships.filter((m) => m.ringId === ring.id));
            items.push({
                id: `ring:${ring.id}`,
                layer: 'communities',
                title: ring.name,
                latitude: ring.location.latitude,
                longitude: ring.location.longitude,
                visibility: ring.visibility,
                eventType: 'other',
                startsAt: nowIso,
                status: 'live',
                source: 'blackout',
                meta: { ringId: ring.id, kind: ring.kind, memberCount },
            });
        }
    }
    return items;
}

export function listAidPosts(filter: { denId?: string } = {}): AidPost[] {
    const now = Date.now();
    return db
        .listCoalitionAidPosts()
        .map((post) => ({ ...post, status: deriveDisplayStatus(post, now) }))
        .filter((post) => (filter.denId ? post.denId === filter.denId : true));
}

export function createAidPost(post: AidPost): AidPost {
    return db.createCoalitionAidPost(post);
}

export function listSellerLocations(filter: { onlyVisible?: boolean } = {}): SellerLocation[] {
    return db.listSellerLocations(filter);
}

export function saveSellerLocation(
    input: Parameters<typeof db.upsertSellerLocation>[0]
): SellerLocation {
    return db.upsertSellerLocation(input);
}

export function newSellerLocationId(): string {
    return `sloc_${rand()}`;
}

export const COALITION_AID_TYPES = AID_POST_TYPES;
export const COALITION_AID_CATEGORIES = AID_POST_CATEGORIES;
export const COALITION_AID_URGENCY = AID_POST_URGENCY;
export const COALITION_AID_STATUS = AID_POST_STATUS;
export const COALITION_SELLER_TYPES = SELLER_LOCATION_TYPES;

export function newAidId(): string {
    return `aidp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

// --- coalition events + RSVPs ---

export function listEvents(filter: { denId?: string } = {}) {
    return db
        .listCoalitionEvents()
        .filter((event) => (filter.denId ? event.denId === filter.denId : true));
}

export function getEvent(id: string) {
    return db.getCoalitionEvent(id);
}

export function saveEvent(input: Parameters<typeof db.upsertCoalitionEvent>[0]) {
    return db.upsertCoalitionEvent(input);
}

export function listEventRsvps(eventId: string) {
    return db.listEventRsvps(eventId);
}

export function rsvpSummaryFor(eventId: string): RsvpSummary {
    return summarizeRsvps(db.listEventRsvps(eventId));
}

export function saveRsvp(input: Parameters<typeof db.upsertEventRsvp>[0]) {
    return db.upsertEventRsvp(input);
}

export function newEventId(): string {
    return `evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function newRsvpId(): string {
    return `rsvp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

// --- event logistics: volunteer slots + ride coordination ---

export function listVolunteerSlots(eventId: string) {
    return db.listVolunteerSlots(eventId);
}
export function getVolunteerSlot(id: string) {
    return db.getVolunteerSlot(id);
}
export function saveVolunteerSlot(input: Parameters<typeof db.upsertVolunteerSlot>[0]) {
    return db.upsertVolunteerSlot(input);
}
export function listVolunteerSignups(eventId: string) {
    return db.listVolunteerSignups(eventId);
}
export function saveVolunteerSignup(input: Parameters<typeof db.upsertVolunteerSignup>[0]) {
    return db.upsertVolunteerSignup(input);
}
export function listRideOffers(eventId: string) {
    return db.listRideOffers(eventId);
}
export function getRideOffer(id: string) {
    return db.getRideOffer(id);
}
export function saveRideOffer(input: Parameters<typeof db.upsertRideOffer>[0]) {
    return db.upsertRideOffer(input);
}
export function listRideClaims(eventId: string) {
    return db.listRideClaims(eventId);
}
export function saveRideClaim(input: Parameters<typeof db.upsertRideClaim>[0]) {
    return db.upsertRideClaim(input);
}

const rand = () => `${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
export function newSlotId(): string {
    return `vslot_${rand()}`;
}
export function newSignupId(): string {
    return `vsign_${rand()}`;
}
export function newRideOfferId(): string {
    return `ride_${rand()}`;
}
export function newRideClaimId(): string {
    return `rclaim_${rand()}`;
}

// --- coalition rings ---

export function listRings() {
    return db.listCoalitionRings();
}
export function getRing(id: string) {
    return db.getCoalitionRing(id);
}
export function saveRing(input: Parameters<typeof db.upsertCoalitionRing>[0]) {
    return db.upsertCoalitionRing(input);
}
export function listRingMemberships(ringId?: string) {
    return db.listRingMemberships(ringId);
}
export function saveRingMembership(input: Parameters<typeof db.upsertRingMembership>[0]) {
    return db.upsertRingMembership(input);
}
export function newRingId(): string {
    return `ring_${rand()}`;
}
export function newMembershipId(): string {
    return `rmem_${rand()}`;
}
export function listRingInvitations(filter: { ringId?: string; inviteeId?: string } = {}) {
    return db.listRingInvitations(filter);
}
export function saveRingInvitation(input: Parameters<typeof db.upsertRingInvitation>[0]) {
    return db.upsertRingInvitation(input);
}
export function newRingInvitationId(): string {
    return `rinv_${rand()}`;
}

// --- coalition kit applications ---

export function listKitApplications(filter: { scopeType?: string; scopeId?: string } = {}) {
    return db.listCoalitionKitApplications(filter);
}
export function recordKitApplication(
    input: Parameters<typeof db.recordCoalitionKitApplication>[0]
) {
    return db.recordCoalitionKitApplication(input);
}
export function newKitApplicationId(): string {
    return `kitapp_${rand()}`;
}

export function nowIso(): string {
    return NOW_ISO();
}

// --- coalition needs board ---

export function listNeeds(filter: { canopyId?: string } = {}) {
    return db.listCoalitionNeeds(filter);
}
export function createNeed(input: Parameters<typeof db.createCoalitionNeed>[0]) {
    return db.createCoalitionNeed(input);
}
export function getNeed(id: string) {
    return db.getCoalitionNeed(id) ?? null;
}
export function updateNeed(id: string, patch: Parameters<typeof db.updateCoalitionNeed>[1]) {
    return db.updateCoalitionNeed(id, patch) ?? null;
}
export function newNeedId(): string {
    return `need_${rand()}`;
}

// --- coalition projects ---

export function listProjects(filter: { canopyId?: string } = {}) {
    return db.listCoalitionProjects(filter);
}
export function createProject(input: Parameters<typeof db.createCoalitionProject>[0]) {
    return db.createCoalitionProject(input);
}
export function getProject(id: string) {
    return db.getCoalitionProject(id) ?? null;
}
export function updateProjectStatus(
    id: string,
    status: Parameters<typeof db.updateCoalitionProjectStatus>[1]
) {
    return db.updateCoalitionProjectStatus(id, status) ?? null;
}
export function updateProject(id: string, patch: Parameters<typeof db.updateCoalitionProject>[1]) {
    return db.updateCoalitionProject(id, patch) ?? null;
}
export function newProjectId(): string {
    return `proj_${rand()}`;
}
export function newProjectSupportId(): string {
    return `psup_${rand()}`;
}
export function newSurgeId(): string {
    return `surge_${rand()}`;
}
export function newNotificationId(): string {
    return `cnot_${rand()}`;
}

// --- coalition resource registry ---

export function listResources(filter: { canopyId?: string } = {}) {
    return db.listCoalitionResources(filter);
}
export function createResource(input: Parameters<typeof db.createCoalitionResource>[0]) {
    return db.createCoalitionResource(input);
}
export function getResource(id: string) {
    return db.getCoalitionResource(id) ?? null;
}
export function updateResourceAvailability(
    id: string,
    availability: Parameters<typeof db.updateCoalitionResourceAvailability>[1]
) {
    return db.updateCoalitionResourceAvailability(id, availability) ?? null;
}
export function newResourceId(): string {
    return `res_${rand()}`;
}
