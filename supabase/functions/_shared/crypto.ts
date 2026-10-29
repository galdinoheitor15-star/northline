// Cifra tokens OAuth (AES-256-GCM) e assina o "state" do OAuth (HMAC-SHA256).
import { requireEnv } from './http.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

async function aesKey(): Promise<CryptoKey> {
  const raw = unb64(requireEnv('TOKEN_ENCRYPTION_KEY'));
  if (raw.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(token: string): Promise<string> {
  const [v, iv, ct] = token.split('.');
  if (v !== 'v1') throw new Error('Formato de token cifrado desconhecido.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(), unb64(ct)));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(requireEnv('OAUTH_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState<T>(state: string): Promise<T | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64url(sig), enc.encode(body));
  if (!ok) return null;
  const payload = JSON.parse(dec.decode(unb64url(body))) as T & { exp: number };
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}
