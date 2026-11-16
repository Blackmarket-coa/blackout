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
 * So the send paths ask first, and refuse when the room is not there. The
 * person keeps their draft and can send again a moment later.
 */

/** Nothing was sent: the room is not loaded, so it cannot be known whether to encrypt. */
export class RoomNotReadyError extends Error {
    constructor() {
        super('This room has not finished loading, so nothing was sent. Try again shortly.');
        this.name = 'RoomNotReadyError';
    }
}

/** Throws `RoomNotReadyError` unless the client holds the room. */
export const assertRoomLoaded = (
    client: { getRoom: (roomId: string) => unknown },
    roomId: string
): void => {
    if (!client.getRoom(roomId)) throw new RoomNotReadyError();
};
