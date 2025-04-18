// --- crypto.js ---
// Handles AES-GCM encryption and decryption using PBKDF2 or fallback key

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SALT_KEY = 'vault_salt'; // for PBKDF2
const FALLBACK_KEY = 'vault_static_key'; // used for fallback encryption

// Generate or retrieve salt for PBKDF2
async function getSalt() {
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    salt = btoa(String.fromCharCode(...saltBytes));
    localStorage.setItem(SALT_KEY, salt);
  }
  return Uint8Array.from(atob(salt), c => c.charCodeAt(0));
}

// Derive AES-GCM key from user master password
async function deriveKey(masterPassword) {
  const salt = await getSalt();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', encoder.encode(masterPassword), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Use fallback key for quick mode (less secure)
async function getFallbackKey() {
  const staticKey = encoder.encode(FALLBACK_KEY.padEnd(32, '_')); // ensure 32-byte length
  return await window.crypto.subtle.importKey(
    'raw',
    staticKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt data with AES-GCM
async function encryptData(data, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(data)
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

// Decrypt data with AES-GCM
async function decryptData(encryptedObj, key) {
  const iv = new Uint8Array(encryptedObj.iv);
  const data = new Uint8Array(encryptedObj.data);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
  return decoder.decode(decrypted);
}

// Export helpers
window.cryptoHelper = {
  deriveKey,
  getFallbackKey,
  encryptData,
  decryptData
};
