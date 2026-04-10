const xorWithKey = (input: string, key: string): string => {
  if (!key) {
    return input;
  }

  const chars = [...input].map((char, index) => {
    const code = char.charCodeAt(0) ^ key.charCodeAt(index % key.length);
    return String.fromCharCode(code);
  });

  return chars.join('');
};

export function encodeStego(content: string, key: string): string {
  return encodeURIComponent(xorWithKey(content, key));
}

export function decodeStego(payload: string, key: string): string {
  const decoded = decodeURIComponent(payload);
  return xorWithKey(decoded, key);
}

export function encryptE2E(content: string, recipientPublicKey: string): string {
  return encodeStego(content, recipientPublicKey.slice(0, 16) || 'blackout-default');
}

export function decryptE2E(ciphertext: string, recipientPublicKey: string): string {
  return decodeStego(ciphertext, recipientPublicKey.slice(0, 16) || 'blackout-default');
}

export function signMessage(content: string, signerId: string): string {
  return encodeURIComponent(`${signerId}:${content}`);
}

export function verifySignature(content: string, signerId: string, signature: string): boolean {
  return signMessage(content, signerId) === signature;
}
