/**
 * Refusing to send into a room this client has not loaded.
 *
 * The Matrix SDK decides whether to encrypt an event from the room object it
 * holds. For a room it does not hold, it sends the event as it is (its
 * `encryptEventIfNeeded`: "If the room is unknown, we cannot encrypt for it").
 * A composer can be on screen for such a room: a conversation that was just
 * created, or a link opened before the first sync has finished. A message
 * typed in that window would reach the server unencrypted, whatever the room
 * turns out to be.
 *
 * So nothing is sent into a room that is not there. The refusal is made in
 * two places: on the client itself, for every sender in the app
 * (`refuseSendsToUnloadedRooms`), and again in the composer's send hooks,
 * which is where a person types. The person keeps their draft and can send
 * again a moment later.
 */

/** Nothing was sent: the room is not loaded, so it cannot be known whether to encrypt. */
export class RoomNotReadyError extends Error {
    constructor() {
        super('This room has not finished loading, so nothing was sent. Try again shortly.');
        this.name = 'RoomNotReadyError';
    }
}

/**
 * Make a client refuse to send an event into a room it does not hold.
 *
 * Applied once, where the client is created (`client/initMatrix.ts`), so the
 * refusal does not depend on each feature remembering to ask. It wraps
 * `sendEvent`, which every message-sending method of the SDK goes through
 * (`sendMessage`, `sendTextMessage`, `sendStickerMessage` and the rest call
 * it on the same object). State events and redactions are not encrypted by
 * Matrix in any room and are left as they are.
 */
export const refuseSendsToUnloadedRooms = <
    T extends {
        getRoom: (roomId: string) => unknown;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendEvent: (...args: any[]) => Promise<unknown>;
    }
>(
    client: T
): T => {
    const send = client.sendEvent.bind(client);
    const guarded = (roomId: string, ...rest: unknown[]): Promise<unknown> => {
        if (!client.getRoom(roomId)) return Promise.reject(new RoomNotReadyError());
        return send(roomId, ...rest);
    };
    // Assigned on the instance: the SDK's own methods reach `sendEvent`
    // through `this`, so they go through the guard too.
    (client as { sendEvent: unknown }).sendEvent = guarded;
    return client;
};

/** Throws `RoomNotReadyError` unless the client holds the room. */
export const assertRoomLoaded = (
    client: { getRoom: (roomId: string) => unknown },
    roomId: string
): void => {
    if (!client.getRoom(roomId)) throw new RoomNotReadyError();
};
