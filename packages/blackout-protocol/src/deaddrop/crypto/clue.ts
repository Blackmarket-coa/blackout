/**
 * Pickup token ("clue"), inspired by SecureDrop Protocol's clue model.
 *
 * The server stores drops keyed by an opaque 16-byte token derived from
 * (recipientPublicKey || dropId). Recipients poll by token; the server
 * cannot link a token back to a Matrix user ID.
 *
 * Cryptographic shape: HKDF-SHA-256 of `recipientPublicKey` with
 * `dropId` as info, output 16 bytes.
 */

import { hkdfSha256 } from './hkdf';
import { fromBase64, utf8Encode } from './encoding';

const CLUE_BYTES = 16;
const SALT = utf8Encode('blackout-deaddrop-clue-v1');

export const deriveClue = async (
    recipientPublicKeyBase64: string,
    dropId: string
): Promise<Uint8Array> => {
    const ikm = fromBase64(recipientPublicKeyBase64);
    if (ikm.length !== 32) {
        throw new Error(`recipient public key must be 32 bytes, got ${ikm.length}`);
    }
    return hkdfSha256(ikm, SALT, utf8Encode(dropId), CLUE_BYTES);
};
