// Cliente mínimo da Google Calendar API v3 (REST) com renovação de token.
import { adminClient } from './auth.ts';
import { decrypt, encrypt } from './crypto.ts';
import { HttpError, requireEnv } from './http.ts';
import type { RemoteEvent } from './sync-logic.ts';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
const API = 'https://www.googleapis.com/calendar/v3';

export function redirectUri(): string {
  return `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/google-oauth`;
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: requireEnv('GOOGLE_CLIENT_ID'), client_secret: requireEnv('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  const body = await res.json();
  if (!res.ok) throw new HttpError(400, `Google recusou a autorização (${body.error ?? res.status}).`, 'oauth_failed');
  return body as { access_token: string; refresh_token?: string; expires_in: number; scope: string; id_token?: string };
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

export interface Secrets {
  access: string;
  refresh: string | null;
  expiresAt: number;
  syncToken: string | null;
}

export async function loadSecrets(userId: string): Promise<Secrets | null> {
  const { data } = await adminClient().from('integration_secrets').select('*').eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle();
  if (!data) return null;
  return { access: await decrypt(data.access_token_enc), refresh: data.refresh_token_enc ? await decrypt(data.refresh_token_enc) : null, expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : 0, syncToken: data.sync_token };
}

export async function markRevoked(userId: string, message: string) {
  const db = adminClient();
  await db.from('integration_secrets').delete().eq('user_id', userId).eq('provider', 'google_calendar');
  await db.from('integrations').update({ status: 'revoked', last_error: message }).eq('user_id', userId).eq('provider', 'google_calendar');
}

/** Garante um access token válido; renova com o refresh token e trata revogação. */
export async function accessToken(userId: string, s: Secrets): Promise<string> {
  if (s.expiresAt - 60_000 > Date.now()) return s.access;
  if (!s.refresh) {
    await markRevoked(userId, 'Autorização expirada. Reconecte o Google Agenda.');
    throw new HttpError(409, 'Autorização do Google expirada. Reconecte.', 'google_revoked');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: requireEnv('GOOGLE_CLIENT_ID'), client_secret: requireEnv('GOOGLE_CLIENT_SECRET'), refresh_token: s.refresh, grant_type: 'refresh_token' }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === 'invalid_grant') {
      await markRevoked(userId, 'O acesso foi revogado no Google. Reconecte para voltar a sincronizar.');
      throw new HttpError(409, 'O acesso ao Google foi revogado. Reconecte.', 'google_revoked');
    }
    throw new HttpError(502, 'Falha ao renovar o acesso ao Google.', 'google_error');
  }
  s.access = body.access_token;
  s.expiresAt = Date.now() + body.expires_in * 1000;
  await adminClient().from('integration_secrets').update({ access_token_enc: await encrypt(s.access), expires_at: new Date(s.expiresAt).toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId).eq('provider', 'google_calendar');
  return s.access;
}

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gapi<T>(token: string, path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : '';
  const res = await fetch(`${API}${path}${qs}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

/** Lista eventos (incremental com syncToken; completa a partir de 30 dias atrás). Lança 410 se o token expirou. */
export async function listEvents(token: string, calendarId: string, syncToken: string | null): Promise<{ items: RemoteEvent[]; nextSyncToken: string | null }> {
  const items: RemoteEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  do {
    const query: Record<string, string> = { singleEvents: 'true', maxResults: '250', showDeleted: 'true' };
    if (syncToken) query.syncToken = syncToken;
    else query.timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
    if (pageToken) query.pageToken = pageToken;
    const page = await gapi<{ items?: RemoteEvent[]; nextPageToken?: string; nextSyncToken?: string }>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { query });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken && items.length < 5000);
  return { items, nextSyncToken };
}
