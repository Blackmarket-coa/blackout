import React, { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, matchPath, useLocation, useNavigate, useParams } from 'react-router';
import { useAtomValue } from 'jotai';
import {
    ClientEvent,
    RoomEvent,
    type Capabilities,
    type MatrixClient,
    type Room,
} from 'matrix-js-sdk';
import { CreateSpaceForm } from '../create-space/CreateSpace';
import { CreateRoomForm } from '../create-room/CreateRoom';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useActiveTheme } from '../../hooks/useTheme';
import { joinedRoomsAtom } from '../../state/rooms';
import { mDirectAtom } from '../../state/mDirectList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { StateEvent } from '../../../types/matrix/room';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { EMBED_PATH } from '../../pages/paths';
import {
    buildEmbedCanopyPath,
    buildEmbedDenPath,
    buildEmbedNewCanopyPath,
    buildEmbedNewDenPath,
    canonicalCanopyPath,
} from './embedPaths';
import { classifyEmbedRoom, roomToEmbedFacts } from './embedScope';
import { decodeRouteId } from './EmbedCanopy';
import { EmbedNotShown } from './EmbedNotShown';
import { cardStyle, linkStyle, mutedTextStyle } from './embedStyles';

/**
 * Making a canopy or a den from the Black Mask chat panel (operator,
 * 2026-10-17: "private by default" lives in the panel's own creation, as
 * well as in the build-time switch).
 *
 * The panel reuses the full app's forms, `CreateSpaceForm` and
 * `CreateRoomForm`, so the access chooser, its copy and the defaults are the
 * app's own: `newRoomDefaults.ts` sees that the page booted on `/embed` and
 * uses its panel column (a canopy starts Private wherever it is made; a den
 * starts Private, or Restricted to the canopy it is made in, and encrypted).
 *
 * What the panel adds around them:
 * - a "New" control in its header (`EmbedNewMenu`);
 * - inside a canopy, a check that the signed-in user may add rooms to it,
 *   before the control offers a form and again on the form's own page (a
 *   panel URL can name any canopy). The forms send `m.space.child` into the
 *   canopy after the new room exists, and the homeserver refuses that below
 *   the canopy's power level for it, which would leave the room made but
 *   not in the canopy;
 * - the homeserver's room versions before a form renders: the full app loads
 *   them at boot and the panel does not, and without them a form starts on
 *   room version 1 (`EmbedRoomVersions`);
 * - once the room exists, opening it in the panel as soon as it has arrived
 *   from sync, with the form gone so a second press cannot make a second room.
 *
 * Invites, room settings and member lists stay out of the panel, as before:
 * a new Private canopy or den is joined by inviting people from Blackout.
 */

/** Whether the signed-in user may add a room to `canopy` (send `m.space.child` there). */
export const useCanAddRoomsTo = (canopy: Room): boolean => {
    const mx = useMatrixClient();
    const creators = useRoomCreators(canopy);
    const powerLevels = usePowerLevels(canopy);
    const permissions = useRoomPermissions(creators, powerLevels);
    return permissions.stateEvent(StateEvent.SpaceChild, mx.getSafeUserId());
};

/** The joined canopy `canopyId` names, or null when it is not one the panel shows. */
const useJoinedCanopy = (canopyId: string | null): Room | null => {
    const joinedRooms = useAtomValue(joinedRoomsAtom);
    const directRoomIds = useAtomValue(mDirectAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    return useMemo(() => {
        if (!canopyId) return null;
        const room = joinedRooms.find((candidate) => candidate.roomId === canopyId);
        if (!room) return null;
        const facts = roomToEmbedFacts(room, directRoomIds, roomToParents.get(room.roomId));
        return classifyEmbedRoom(facts) === 'canopy' ? room : null;
    }, [canopyId, joinedRooms, directRoomIds, roomToParents]);
};

/**
 * Resolves once `roomId` is a room this client has joined (it arrives from
 * sync shortly after `/createRoom` answers), or with false after `timeoutMs`
 * or when `signal` aborts. Either way its listeners and timer are removed.
 */
export const waitForJoinedRoom = (
    mx: MatrixClient,
    roomId: string,
    { timeoutMs = 15_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<boolean> =>
    new Promise((resolve) => {
        const joined = () => mx.getRoom(roomId)?.getMyMembership() === 'join';
        if (joined()) {
            resolve(true);
            return;
        }
        const finish = (result: boolean) => {
            clearTimeout(timer);
            mx.removeListener(ClientEvent.Room, check);
            mx.removeListener(RoomEvent.MyMembership, check);
            signal?.removeEventListener('abort', abort);
            resolve(result);
        };
        const check = () => {
            if (joined()) finish(true);
        };
        const abort = () => finish(false);
        const timer = setTimeout(abort, timeoutMs);
        mx.on(ClientEvent.Room, check);
        mx.on(RoomEvent.MyMembership, check);
        signal?.addEventListener('abort', abort);
    });

type RoomVersionsLoad =
    | { status: 'loading' }
    | { status: 'ready'; capabilities: Capabilities }
    | { status: 'failed' };

/**
 * Renders `children` with the homeserver's capabilities provided, once they
 * name the room versions. Until then "Loading…", and if they cannot be read
 * the form is not offered at all rather than made on a guessed version.
 */
export const EmbedRoomVersions = ({
    openPath,
    children,
}: {
    openPath: string;
    children: ReactNode;
}) => {
    const mx = useMatrixClient();
    const [load, setLoad] = useState<RoomVersionsLoad>({ status: 'loading' });
    useEffect(() => {
        let cancelled = false;
        mx.getCapabilities().then(
            (capabilities) => {
                if (cancelled) return;
                setLoad(
                    capabilities?.['m.room_versions']?.default
                        ? { status: 'ready', capabilities }
                        : { status: 'failed' }
                );
            },
            () => {
                if (!cancelled) setLoad({ status: 'failed' });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [mx]);

    if (load.status === 'loading') {
        return (
            <p data-testid="embed-new-loading" role="status" style={{ margin: 12, opacity: 0.8 }}>
                Loading…
            </p>
        );
    }
    if (load.status === 'failed') {
        return (
            <EmbedNotShown
                reason="The panel couldn't read which room versions your homeserver offers, so it can't make a room right now."
                note="Try again later, or make it in Blackout."
                openPath={openPath}
            />
        );
    }
    return <CapabilitiesProvider value={load.capabilities}>{children}</CapabilitiesProvider>;
};

/** Shown inside a canopy the signed-in user may not add rooms to. */
const EmbedCannotAdd = ({ canopy }: { canopy: Room }) => (
    <EmbedNotShown
        reason={`You can't add rooms to ${
            canopy.name || `this ${BLACKOUT_TERMS.canopy.singular}`
        }.`}
        note={`Its moderators decide who can add ${BLACKOUT_TERMS.den.plural} and ${BLACKOUT_TERMS.canopy.plural} to it.`}
        openPath={canonicalCanopyPath(canopy.roomId)}
    />
);

/**
 * The page around a form: a back link, a title, the panel's one note about
 * invites, and, after the room is made, "Opening…" until it can be shown.
 */
const EmbedCreatePage = ({
    title,
    backTo,
    renderForm,
    pathOf,
}: {
    title: string;
    backTo: string;
    renderForm: (onCreate: (roomId: string) => void) => ReactNode;
    pathOf: (roomId: string) => string;
}) => {
    const mx = useMatrixClient();
    const navigate = useNavigate();
    const theme = useActiveTheme();
    // The room's panel address is worked out when it is made, so nothing that
    // re-renders this page while sync catches up restarts the wait.
    const [created, setCreated] = useState<{
        roomId: string;
        path: string;
        arrived: boolean | null;
    } | null>(null);

    useEffect(() => {
        if (!created || created.arrived !== null) return undefined;
        const controller = new AbortController();
        void waitForJoinedRoom(mx, created.roomId, { signal: controller.signal }).then(
            (arrived) => {
                if (controller.signal.aborted) return;
                if (arrived) navigate(created.path);
                else setCreated({ ...created, arrived: false });
            }
        );
        return () => controller.abort();
    }, [created, mx, navigate]);

    return (
        <div
            data-testid="embed-new-page"
            // The forms are built from folds controls, whose colours come from a
            // folds theme class; nothing puts one on the document any more (the
            // app's theme engine sets its own variables), so without this the
            // name box and the Create button render with no background.
            className={theme.classNames.join(' ')}
            style={{ display: 'grid', gap: 8, padding: 12 }}
        >
            <Link to={backTo} style={{ ...linkStyle, fontSize: 13 }}>
                ← Back
            </Link>
            <strong style={{ fontSize: 16 }}>{title}</strong>
            {created ? (
                <section style={cardStyle} role="status" data-testid="embed-new-created">
                    {created.arrived === false ? (
                        <>
                            <p style={{ margin: 0 }}>
                                It was made, but hasn&apos;t reached the panel yet.
                            </p>
                            <Link to={created.path} style={linkStyle}>
                                Open it
                            </Link>
                        </>
                    ) : (
                        <p style={{ margin: 0 }}>Opening…</p>
                    )}
                </section>
            ) : (
                <>
                    <p style={mutedTextStyle} data-testid="embed-new-invite-note">
                        The panel has no invite screen: to invite people, open the new room in
                        Blackout.
                    </p>
                    {renderForm((roomId) =>
                        setCreated({ roomId, path: pathOf(roomId), arrived: null })
                    )}
                </>
            )}
        </div>
    );
};

/**
 * `/embed/canopies/:canopyId/...` forms: the canopy must be a joined canopy
 * the panel shows, and the user must be able to add rooms to it.
 */
const EmbedInCanopy = ({
    canopyId,
    children,
}: {
    canopyId: string | null;
    children: (canopy: Room) => ReactNode;
}) => {
    const mx = useMatrixClient();
    const canopy = useJoinedCanopy(canopyId);
    if (canopyId && !canopy && !mx.isInitialSyncComplete()) {
        return (
            <p data-testid="embed-new-loading" role="status" style={{ margin: 12, opacity: 0.8 }}>
                Loading…
            </p>
        );
    }
    if (!canopyId || !canopy) {
        return (
            <EmbedNotShown
                reason={`This ${BLACKOUT_TERMS.canopy.singular} isn't available in the panel.`}
                openPath={canopyId ? canonicalCanopyPath(canopyId) : '/'}
            />
        );
    }
    return <EmbedAddableCanopy canopy={canopy}>{children}</EmbedAddableCanopy>;
};

const EmbedAddableCanopy = ({
    canopy,
    children,
}: {
    canopy: Room;
    children: (canopy: Room) => ReactNode;
}) => {
    const canAdd = useCanAddRoomsTo(canopy);
    return canAdd ? <>{children(canopy)}</> : <EmbedCannotAdd canopy={canopy} />;
};

/** `/embed/new/canopy` and `/embed/canopies/:canopyId/new/canopy`. */
export const EmbedNewCanopy = () => {
    const params = useParams<{ canopyId?: string }>();
    const parentId = decodeRouteId(params.canopyId);
    const page = (parent: Room | undefined) => (
        <EmbedCreatePage
            key={parent?.roomId ?? 'top level'}
            title={
                parent
                    ? `New ${BLACKOUT_TERMS.canopy.singular} in ${parent.name}`
                    : `New ${BLACKOUT_TERMS.canopy.singular}`
            }
            backTo={parent ? buildEmbedCanopyPath(parent.roomId) : EMBED_PATH}
            pathOf={buildEmbedCanopyPath}
            renderForm={(onCreate) => (
                <EmbedRoomVersions openPath={parent ? canonicalCanopyPath(parent.roomId) : '/'}>
                    <CreateSpaceForm space={parent} onCreate={onCreate} />
                </EmbedRoomVersions>
            )}
        />
    );
    if (!params.canopyId) return page(undefined);
    return <EmbedInCanopy canopyId={parentId}>{(parent) => page(parent)}</EmbedInCanopy>;
};

/** `/embed/canopies/:canopyId/new/den`. */
export const EmbedNewDen = () => {
    const params = useParams<{ canopyId?: string }>();
    const canopyId = decodeRouteId(params.canopyId);
    return (
        <EmbedInCanopy canopyId={canopyId}>
            {(canopy) => (
                <EmbedCreatePage
                    key={canopy.roomId}
                    title={`New ${BLACKOUT_TERMS.den.singular} in ${canopy.name}`}
                    backTo={buildEmbedCanopyPath(canopy.roomId)}
                    pathOf={(roomId) => buildEmbedDenPath(canopy.roomId, roomId)}
                    renderForm={(onCreate) => (
                        <EmbedRoomVersions openPath={canonicalCanopyPath(canopy.roomId)}>
                            <CreateRoomForm space={canopy} onCreate={onCreate} />
                        </EmbedRoomVersions>
                    )}
                />
            )}
        </EmbedInCanopy>
    );
};

const menuLinkStyle = { ...linkStyle, display: 'block', padding: '6px 8px', fontSize: 13 };

/** The canopy-scoped entries, for a canopy the menu was opened inside. */
const EmbedNewInCanopyItems = ({ canopy }: { canopy: Room }) => {
    const canAdd = useCanAddRoomsTo(canopy);
    if (!canAdd) {
        return (
            <p style={{ ...mutedTextStyle, padding: '6px 8px' }} data-testid="embed-new-cannot-add">
                You can&apos;t add rooms to {canopy.name}.
            </p>
        );
    }
    return (
        <>
            <Link
                to={buildEmbedNewDenPath(canopy.roomId)}
                style={menuLinkStyle}
                data-testid="embed-new-den-in-canopy"
            >
                New {BLACKOUT_TERMS.den.singular} in {canopy.name}
            </Link>
            <Link
                to={buildEmbedNewCanopyPath(canopy.roomId)}
                style={menuLinkStyle}
                data-testid="embed-new-canopy-in-canopy"
            >
                New {BLACKOUT_TERMS.canopy.singular} in {canopy.name}
            </Link>
        </>
    );
};

/**
 * The header's "New" control. A new canopy can be made from anywhere in the
 * panel; under `/embed/canopies/:canopyId` it also offers a den or a canopy
 * inside that canopy, when the user may add rooms to it.
 */
export const EmbedNewMenu = () => {
    const { pathname, key } = useLocation();
    // Open only for the location it was opened at, so any navigation closes
    // it, including one its own links start to the page already shown (the
    // panel's link guard handles those clicks before they reach anything in
    // here). Every navigation gets a new location key; the path may not change.
    const [openOn, setOpenOn] = useState<string | null>(null);
    const open = openOn === key;
    const menuId = useId();
    const match = matchPath({ path: `${EMBED_PATH}/canopies/:canopyId/*` }, pathname);
    const canopy = useJoinedCanopy(decodeRouteId(match?.params.canopyId));

    return (
        <div
            style={{ position: 'relative' }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') setOpenOn(null);
            }}
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpenOn(open ? null : key)}
                data-testid="embed-new"
                style={{
                    ...linkStyle,
                    fontSize: 13,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                + New
            </button>
            {open ? (
                <div
                    id={menuId}
                    data-testid="embed-new-menu"
                    style={{
                        ...cardStyle,
                        margin: 0,
                        padding: 4,
                        gap: 0,
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        zIndex: 10,
                        minWidth: 220,
                    }}
                >
                    <Link
                        to={buildEmbedNewCanopyPath(null)}
                        style={menuLinkStyle}
                        data-testid="embed-new-canopy"
                    >
                        New {BLACKOUT_TERMS.canopy.singular}
                    </Link>
                    {canopy ? <EmbedNewInCanopyItems canopy={canopy} /> : null}
                </div>
            ) : null}
        </div>
    );
};
