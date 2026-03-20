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

const readFileAsDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = async (file: File): Promise<HTMLImageElement> => {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image.'));
    img.src = dataUrl;
  });
};

const bytesToBits = (bytes: Uint8Array): number[] => {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits.push((byte >> bit) & 1);
    }
  }
  return bits;
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: MIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-CBC',
      length: 256,
    },
    false,
    ['encrypt'],
  );
};

const buildEncryptedPayload = async (message: string, passphrase: string): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(message);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plainBytes);
  const cipherBytes = new Uint8Array(cipherBuffer);

  const checksum = crc32(plainBytes);

  const payload = new Uint8Array(STEGO_MAGIC.length + 1 + 16 + 16 + 4 + cipherBytes.length);
  let offset = 0;

  for (const char of STEGO_MAGIC) {
    payload[offset] = char.charCodeAt(0);
    offset += 1;
  }
  payload[offset] = 1;
  offset += 1;

  payload.set(salt, offset);
  offset += salt.length;

  payload.set(iv, offset);
  offset += iv.length;

  new DataView(payload.buffer).setUint32(offset, checksum, false);
  offset += 4;

  payload.set(cipherBytes, offset);

  return payload;
};

const encodeBitsIntoPixels = (pixels: Uint8ClampedArray, bits: number[]) => {
  let bitIndex = 0;
  for (let i = 0; i < pixels.length && bitIndex < bits.length; i += 1) {
    if ((i + 1) % 4 === 0) continue;
    pixels[i] = (pixels[i] & 0xfe) | bits[bitIndex];
    bitIndex += 1;
  }

  if (bitIndex < bits.length) {
    throw new Error('Image does not have enough capacity for hidden content.');
  }
};

const imageToBlob = async (canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to serialize image.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      mimeType === 'image/jpeg' ? 0.98 : undefined,
    );
  });

export interface EncodedStegoImage {
  file: File;
  maxMessageLength: number;
}

export interface StegoCapacity {
  maxMessageLength: number;
  maxPayloadBytes: number;
}

export const getSteganographyCapacity = async (imageFile: File): Promise<StegoCapacity> => {
  const image = await loadImage(imageFile);
  const totalChannels = image.width * image.height * 3;
  const maxPayloadBytes = Math.floor(totalChannels / 8) - HEADER_SIZE;
  const maxMessageLength = Math.max(maxPayloadBytes - 128, 0);
  return { maxMessageLength, maxPayloadBytes };
};

export const encodeMessageInImage = async (message: string, imageFile: File, passphrase: string): Promise<EncodedStegoImage> => {
  if (!passphrase.trim()) {
    throw new Error('Passphrase is required for steganography encoding.');
  }

  if (!/^image\/(png|jpeg)$/.test(imageFile.type)) {
    throw new Error('Only PNG and JPEG images are supported.');
  }

  const image = await loadImage(imageFile);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is unavailable in this browser environment.');
  }

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const encryptedPayload = await buildEncryptedPayload(message, passphrase);
  const totalChannels = canvas.width * canvas.height * 3;
  const maxPayloadBytes = Math.floor(totalChannels / 8) - HEADER_SIZE;

  if (encryptedPayload.length > maxPayloadBytes) {
    throw new Error('Message is too large for this image.');
  }

  const packet = new Uint8Array(HEADER_SIZE + encryptedPayload.length);
  const view = new DataView(packet.buffer);
  view.setUint32(0, encryptedPayload.length, false);
  view.setUint32(4, crc32(encryptedPayload), false);
  packet.set(encryptedPayload, HEADER_SIZE);

  encodeBitsIntoPixels(imageData.data, bytesToBits(packet));
  ctx.putImageData(imageData, 0, 0);

  const encodedBlob = await imageToBlob(canvas, imageFile.type);
  const encodedFile = new File([encodedBlob], imageFile.name.replace(/(\.[^.]+)?$/, '-hidden$1'), {
    type: imageFile.type,
    lastModified: Date.now(),
  });

  return {
    file: encodedFile,
    maxMessageLength: Math.max(maxPayloadBytes - 128, 0),
  };
};
