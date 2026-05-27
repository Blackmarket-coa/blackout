import type {
    AidPost,
    CoalitionEvent,
    CoalitionFeedItem,
    CoalitionKit,
    CoalitionRankingModel,
    CoalitionRing,
    CoalitionTabId,
    CoalitionTask,
    RingInvitation,
    RingMembership,
    RingRole,
    EventCategory,
    EventLocation,
    EventOccurrence,
    EventRecurrence,
    EventRsvp,
    EventVisibility,
    RingKind,
    RingVisibility,
    RsvpStatus,
    RsvpSummary,
    SellerLocation,
    SpatialFeedItem,
    TaskStatus,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const COALITION_BASE = '/v1/coalition';

export interface CoalitionScopeQuery {
    canopyId?: string;
    denId?: string;
}

export interface CoalitionFeedResponse {
    generatedAt: string;
    items: CoalitionFeedItem[];
}

export interface SpatialFeedResponse {
    generatedAt: string;
    layers: string[];
    items: SpatialFeedItem[];
}

export interface MutualAidResponse {
    posts: AidPost[];
}

/** Viewer-centred radius filter shared by mutual-aid + seller-location queries. */
export interface NearbyQuery {
    lat: number;
    lng: number;
    radiusKm: number;
}

function nearbyParams(nearby?: NearbyQuery): Record<string, string | undefined> {
    if (!nearby) return {};
    return {
        lat: String(nearby.lat),
        lng: String(nearby.lng),
        radiusKm: String(nearby.radiusKm),
    };
}

export interface SellerLocationsResponse {
    locations: SellerLocation[];
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, value);
        }
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

function patchJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PATCH', path, body }) as Promise<T>;
}

export function fetchCoalitionFeed(
    scope: CoalitionScopeQuery,
    options: {
        kind?: CoalitionFeedItem['kind'];
        model?: CoalitionRankingModel;
        limit?: number;
    } = {},
    token: string | null = readBlackoutApiToken()
): Promise<CoalitionFeedResponse> {
    const path = appendQuery(`${COALITION_BASE}/feed`, {
        canopyId: scope.canopyId,
        denId: scope.denId,
        kind: options.kind,
        model: options.model,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<CoalitionFeedResponse>(path, token);
}

export function fetchSpatialFeed(
    scope: CoalitionScopeQuery,
    layers?: string[],
    token: string | null = readBlackoutApiToken()
): Promise<SpatialFeedResponse> {
    const path = appendQuery(`${COALITION_BASE}/spatial-feed`, {
        canopyId: scope.canopyId,
        layers: layers && layers.length > 0 ? layers.join(',') : undefined,
    });
    return getJson<SpatialFeedResponse>(path, token);
}

export function fetchMutualAid(
    scope: CoalitionScopeQuery,
    nearby?: NearbyQuery,
    token: string | null = readBlackoutApiToken()
): Promise<MutualAidResponse> {
    const path = appendQuery(`${COALITION_BASE}/mutual-aid`, {
        denId: scope.denId,
        ...nearbyParams(nearby),
    });
    return getJson<MutualAidResponse>(path, token);
}

export function fetchSellerLocations(
    nearby?: NearbyQuery,
    token: string | null = readBlackoutApiToken()
): Promise<SellerLocationsResponse> {
    const path = appendQuery(`${COALITION_BASE}/seller-locations`, nearbyParams(nearby));
    return getJson<SellerLocationsResponse>(path, token);
}

export interface CreateAidPostInput {
    type: AidPost['type'];
    category: AidPost['category'];
    title: string;
    description: string;
    location: AidPost['location'];
    displayRadiusMeters?: number;
    urgency?: AidPost['urgency'];
    expiresAt?: string;
    denId?: string;
}

export function createCoalitionAidPost(
    input: CreateAidPostInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ post: AidPost }> {
    return postJson<{ post: AidPost }>(`${COALITION_BASE}/mutual-aid`, input, token);
}

export interface TasksResponse {
    tasks: CoalitionTask[];
}

export function fetchCoalitionTasks(
    scope: CoalitionScopeQuery,
    token: string | null = readBlackoutApiToken()
): Promise<TasksResponse> {
    const path = appendQuery(`${COALITION_BASE}/tasks`, { denId: scope.denId });
    return getJson<TasksResponse>(path, token);
}

export interface CreateTaskInput {
    denId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    proposalEventId?: string;
}

export function createCoalitionTask(
    input: CreateTaskInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ task: CoalitionTask }> {
    return postJson<{ task: CoalitionTask }>(`${COALITION_BASE}/tasks`, input, token);
}

export function updateCoalitionTaskStatus(
    id: string,
    status: TaskStatus,
    token: string | null = readBlackoutApiToken()
): Promise<{ task: CoalitionTask }> {
    return patchJson<{ task: CoalitionTask }>(
        `${COALITION_BASE}/tasks/${encodeURIComponent(id)}`,
        { status },
        token
    );
}

// --- coalition events ---

export interface CoalitionEventSummary extends CoalitionEvent {
    rsvpSummary: RsvpSummary;
    nextOccurrence?: EventOccurrence;
}

export interface EventsResponse {
    events: CoalitionEventSummary[];
}

export interface EventDetailResponse {
    event: CoalitionEvent;
    rsvpSummary: RsvpSummary;
    rsvps: EventRsvp[];
    occurrences: EventOccurrence[];
}

export interface CreateEventInput {
    title: string;
    description: string;
    location: EventLocation;
    startsAt: string;
    endsAt?: string;
    category: EventCategory;
    visibility?: EventVisibility;
    denId?: string;
    capacity?: number;
    recurrence?: EventRecurrence;
}

export function fetchCoalitionEvents(
    scope: CoalitionScopeQuery,
    token: string | null = readBlackoutApiToken()
): Promise<EventsResponse> {
    const path = appendQuery(`${COALITION_BASE}/events`, { denId: scope.denId });
    return getJson<EventsResponse>(path, token);
}

export function fetchCoalitionEvent(
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<EventDetailResponse> {
    return getJson<EventDetailResponse>(
        `${COALITION_BASE}/events/${encodeURIComponent(id)}`,
        token
    );
}

export function createCoalitionEvent(
    input: CreateEventInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ event: CoalitionEvent }> {
    return postJson<{ event: CoalitionEvent }>(`${COALITION_BASE}/events`, input, token);
}

export interface UpdateEventInput {
    title?: string;
    description?: string;
    location?: EventLocation;
    startsAt?: string;
    endsAt?: string | null;
    status?: CoalitionEvent['status'];
    denId?: string | null;
    capacity?: number | null;
    recurrence?: EventRecurrence | null;
}

export function updateCoalitionEvent(
    id: string,
    patch: UpdateEventInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ event: CoalitionEvent }> {
    return patchJson<{ event: CoalitionEvent }>(
        `${COALITION_BASE}/events/${encodeURIComponent(id)}`,
        patch,
        token
    );
}

export function rsvpToEvent(
    id: string,
    status: RsvpStatus,
    token: string | null = readBlackoutApiToken()
): Promise<{ rsvp: EventRsvp; rsvpSummary: RsvpSummary }> {
    return postJson<{ rsvp: EventRsvp; rsvpSummary: RsvpSummary }>(
        `${COALITION_BASE}/events/${encodeURIComponent(id)}/rsvp`,
        { status },
        token
    );
}

export function createEventDen(
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ denId?: string; event?: CoalitionEvent; created?: boolean }> {
    return postJson<{ denId?: string; event?: CoalitionEvent; created?: boolean }>(
        `${COALITION_BASE}/events/${encodeURIComponent(id)}/den`,
        {},
        token
    );
}

// --- event logistics: volunteer slots + rides ---

export interface VolunteerSlotView {
    id: string;
    eventId: string;
    role: string;
    capacity: number;
    filled: number;
    remaining: number;
}
export interface RideOfferView {
    id: string;
    eventId: string;
    driverId: string;
    originLabel: string;
    departAt?: string;
    seatsTotal: number;
    notes?: string;
    claimed: number;
    seatsRemaining: number;
}

const eventPath = (id: string, suffix: string) =>
    `${COALITION_BASE}/events/${encodeURIComponent(id)}${suffix}`;

export function fetchVolunteerSlots(
    eventId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ slots: VolunteerSlotView[] }> {
    return getJson<{ slots: VolunteerSlotView[] }>(eventPath(eventId, '/volunteer-slots'), token);
}

export function createVolunteerSlot(
    eventId: string,
    input: { role: string; capacity: number },
    token: string | null = readBlackoutApiToken()
): Promise<{ slot: VolunteerSlotView }> {
    return postJson<{ slot: VolunteerSlotView }>(
        eventPath(eventId, '/volunteer-slots'),
        input,
        token
    );
}

export function volunteerSignup(
    eventId: string,
    slotId: string,
    withdraw = false,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    const action = withdraw ? 'withdraw' : 'signup';
    return postJson(
        eventPath(eventId, `/volunteer-slots/${encodeURIComponent(slotId)}/${action}`),
        {},
        token
    );
}

export function fetchRideOffers(
    eventId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ offers: RideOfferView[] }> {
    return getJson<{ offers: RideOfferView[] }>(eventPath(eventId, '/rides'), token);
}

export function createRideOffer(
    eventId: string,
    input: { originLabel: string; departAt?: string; seatsTotal: number; notes?: string },
    token: string | null = readBlackoutApiToken()
): Promise<{ offer: RideOfferView }> {
    return postJson<{ offer: RideOfferView }>(eventPath(eventId, '/rides'), input, token);
}

export function claimRide(
    eventId: string,
    offerId: string,
    release = false,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    const action = release ? 'release' : 'claim';
    return postJson(
        eventPath(eventId, `/rides/${encodeURIComponent(offerId)}/${action}`),
        {},
        token
    );
}

// --- coalition rings ---

export interface RingView extends CoalitionRing {
    memberCount: number;
}

export interface CreateRingInput {
    name: string;
    description?: string;
    kind?: RingKind;
    visibility?: RingVisibility;
    location?: { latitude: number; longitude: number; address?: string };
    denId?: string;
}

export function fetchRings(
    memberId: string | undefined,
    token: string | null = readBlackoutApiToken()
): Promise<{ rings: RingView[] }> {
    return getJson<{ rings: RingView[] }>(
        appendQuery(`${COALITION_BASE}/rings`, { memberId }),
        token
    );
}

export function createRing(
    input: CreateRingInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ ring: CoalitionRing; memberCount: number }> {
    return postJson<{ ring: CoalitionRing; memberCount: number }>(
        `${COALITION_BASE}/rings`,
        input,
        token
    );
}

export function joinRing(
    id: string,
    leave = false,
    token: string | null = readBlackoutApiToken()
): Promise<{ memberCount: number }> {
    return postJson<{ memberCount: number }>(
        `${COALITION_BASE}/rings/${encodeURIComponent(id)}/${leave ? 'leave' : 'join'}`,
        {},
        token
    );
}

export interface RingMemberSummary {
    userId: string;
    role: RingRole;
}

export interface RingDetailResponse {
    ring: CoalitionRing;
    memberCount: number;
    members: RingMemberSummary[];
}

export function fetchRing(
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<RingDetailResponse> {
    return getJson<RingDetailResponse>(`${COALITION_BASE}/rings/${encodeURIComponent(id)}`, token);
}

export function updateRingMember(
    ringId: string,
    userId: string,
    role: RingRole,
    token: string | null = readBlackoutApiToken()
): Promise<{ membership: RingMembership }> {
    return patchJson<{ membership: RingMembership }>(
        `${COALITION_BASE}/rings/${encodeURIComponent(ringId)}/members/${encodeURIComponent(
            userId
        )}`,
        { role },
        token
    );
}

export function fetchRingInvites(
    ringId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ invitations: RingInvitation[] }> {
    return getJson<{ invitations: RingInvitation[] }>(
        `${COALITION_BASE}/rings/${encodeURIComponent(ringId)}/invites`,
        token
    );
}

export interface UserSearchResult {
    id: string;
    username: string;
}

export function searchCoalitionUsers(
    q: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ users: UserSearchResult[] }> {
    return getJson<{ users: UserSearchResult[] }>(
        appendQuery(`${COALITION_BASE}/user-search`, { q }),
        token
    );
}

export function inviteToRing(
    ringId: string,
    inviteeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ invitation: RingInvitation }> {
    return postJson<{ invitation: RingInvitation }>(
        `${COALITION_BASE}/rings/${encodeURIComponent(ringId)}/invites`,
        { inviteeId },
        token
    );
}

export function fetchMyRingInvites(
    token: string | null = readBlackoutApiToken()
): Promise<{ invitations: RingInvitation[] }> {
    return getJson<{ invitations: RingInvitation[] }>(
        `${COALITION_BASE}/rings/invites/mine`,
        token
    );
}

export function respondToRingInvite(
    ringId: string,
    accept: boolean,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    return postJson(
        `${COALITION_BASE}/rings/${encodeURIComponent(ringId)}/invites/${
            accept ? 'accept' : 'decline'
        }`,
        {},
        token
    );
}

// --- coalition kits ---

export interface KitApplication {
    id: string;
    kitId: string;
    scopeType: string;
    scopeId: string;
    appliedByUserId: string;
    createdAt: string;
}

export function fetchKits(
    token: string | null = readBlackoutApiToken()
): Promise<{ kits: CoalitionKit[] }> {
    return getJson<{ kits: CoalitionKit[] }>(`${COALITION_BASE}/kits`, token);
}

export function fetchAppliedKits(
    scopeType: string,
    scopeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ applications: KitApplication[] }> {
    return getJson<{ applications: KitApplication[] }>(
        appendQuery(`${COALITION_BASE}/kits/applied`, { scopeType, scopeId }),
        token
    );
}

export function applyKit(
    kitId: string,
    scope: { scopeType: string; scopeId: string },
    token: string | null = readBlackoutApiToken()
): Promise<{ kit: CoalitionKit; enabledTabs: CoalitionTabId[]; application: KitApplication }> {
    return postJson<{
        kit: CoalitionKit;
        enabledTabs: CoalitionTabId[];
        application: KitApplication;
    }>(`${COALITION_BASE}/kits/${encodeURIComponent(kitId)}/apply`, scope, token);
}
