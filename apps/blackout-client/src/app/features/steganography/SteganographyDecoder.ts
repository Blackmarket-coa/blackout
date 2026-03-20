const STEGO_MAGIC = 'BKO1';
const HEADER_SIZE = 8;
const MIN_PBKDF2_ITERATIONS = 120_000;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const bitsToBytes = (bits: number[]): Uint8Array => {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | bits[i * 8 + j];
    }
    bytes[i] = value;
  }
  return bytes;
};

const readBlobAsDataUrl = async (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });

const loadImageFromBlob = async (file: Blob): Promise<HTMLImageElement> => {
  const dataUrl = await readBlobAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image.'));
    img.src = dataUrl;
  });
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as globalThis.BufferSource,
      iterations: MIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-CBC',
      length: 256,
    },
    false,
    ['decrypt'],
  );
};

const extractLsbBits = (pixels: Uint8ClampedArray, bitLength: number): number[] => {
  const bits: number[] = [];
  for (let i = 0; i < pixels.length && bits.length < bitLength; i += 1) {
    if ((i + 1) % 4 === 0) continue;
    bits.push(pixels[i] & 1);
  }
  return bits;
};

const decodePayload = async (payload: Uint8Array, passphrase: string): Promise<string | null> => {
  if (payload.length < 4 + 1 + 16 + 16 + 4) return null;

  const magic = String.fromCharCode(payload[0], payload[1], payload[2], payload[3]);
  if (magic !== STEGO_MAGIC) return null;

  const version = payload[4];
  if (version !== 1) return null;

  const salt = payload.slice(5, 21);
  const iv = payload.slice(21, 37);
  const expectedCrc = new DataView(payload.buffer, payload.byteOffset + 37, 4).getUint32(0, false);
  const ciphertext = payload.slice(41);

  try {
    const key = await deriveKey(passphrase, salt);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
    const plainBytes = new Uint8Array(plainBuffer);
    const actualCrc = crc32(plainBytes);
    if (actualCrc !== expectedCrc) return null;
    return new TextDecoder().decode(plainBytes);
  } catch {
    return null;
  }
};

export const decodeMessageFromImage = async (imageFile: Blob, passphrase: string): Promise<string | null> => {
  if (!passphrase.trim()) return null;

  const image = await loadImageFromBlob(imageFile);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, image.width, image.height);

  const headerBits = extractLsbBits(imageData.data, HEADER_SIZE * 8);
  if (headerBits.length < HEADER_SIZE * 8) return null;

  const headerBytes = bitsToBytes(headerBits);
  const payloadLength = new DataView(headerBytes.buffer).getUint32(0, false);
  const expectedPayloadCrc = new DataView(headerBytes.buffer).getUint32(4, false);

  if (payloadLength <= 0 || payloadLength > Math.floor((image.width * image.height * 3) / 8)) return null;

  const totalBits = (HEADER_SIZE + payloadLength) * 8;
  const allBits = extractLsbBits(imageData.data, totalBits);
  if (allBits.length < totalBits) return null;

  const packetBytes = bitsToBytes(allBits);
  const payload = packetBytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);
  if (crc32(payload) !== expectedPayloadCrc) return null;

  return decodePayload(payload, passphrase);
};
