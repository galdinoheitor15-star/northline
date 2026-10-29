// Sincronização bidirecional com o Google Agenda.
// 1) PULL incremental (syncToken); se o token expirar (410), refaz a sincronização completa.
// 2) PUSH das alterações locais pendentes, com If-Match (etag) para não sobrescrever mudanças remotas.
// Conflitos (mudou dos dois lados) vão para sync_conflicts e o usuário decide.
import { adminClient, requireUser } from '../_shared/auth.ts';
import { accessToken, gapi, GoogleApiError, listEvents, loadSecrets } from '../_shared/google.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { decidePull, decidePush, fromRRule, remoteRange, toRRule, type LocalEventState, type RemoteEvent, type SimpleRecurrence } from '../_shared/sync-logic.ts';
import { localParts } from '../_shared/time.ts';

interface LocalRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  location: string | null;
  meeting_url: string | null;
  recurrence: SimpleRecurrence | null;
  recurrence_exceptions: string[];
  status: 'confirmed' | 'cancelled';
  external_id: string | null;
  external_etag: string | null;
  sync_status: LocalEventState['syncStatus'];
}

const toState = (r: LocalRow): LocalEventState => ({ id: r.id, externalId: r.external_id, externalEtag: r.external_etag, syncStatus: r.sync_status, status: r.status, recurrence: r.recurrence });

function remoteToColumns(r: RemoteEvent, fallbackTz: string) {
  const range = remoteRange(r)!;
  return {
    title: (r.summary ?? '(sem título)').slice(0, 200),
    description: r.description?.slice(0, 5000) ?? null,
    start_at: range.startAt,
    end_at: range.endAt > range.startAt ? range.endAt : new Date(new Date(range.startAt).getTime() + 30 * 60_000).toISOString(),
    all_day: range.allDay,
    timezone: r.start?.timeZone ?? fallbackTz,
    location: r.location?.slice(0, 300) ?? null,
    meeting_url: r.hangoutLink ?? null,
    recurrence: fromRRule(r.recurrence),
    external_id: r.id,
    external_etag: r.etag ?? null,
    external_updated_at: r.updated ?? null,
    sync_status: 'synced' as const,
    status: 'confirmed' as const,
  };
}

function localToRemote(e: LocalRow): Record<string, unknown> {
  const body: Record<string, unknown> = { summary: e.title, description: e.description ?? undefined, location: e.location ?? undefined };
  if (e.all_day) {
    body.start = { date: localParts(new Date(e.start_at), e.timezone).date };
    body.end = { date: localParts(new Date(e.end_at), e.timezone).date };
  } else {
    body.start = { dateTime: e.start_at, timeZone: e.timezone };
    body.end = { dateTime: e.end_at, timeZone: e.timezone };
  }
  if (e.recurrence) {
    const ex = e.recurrence_exceptions.map((d) => `EXDATE;TZID=${e.timezone}:${localParts(new Date(d), e.timezone).date.replace(/-/g, '')}T${localParts(new Date(d), e.timezone).time.replace(':', '')}00`);
    body.recurrence = [toRRule(e.recurrence), ...ex];
  }
  // lembretes do evento ficam com o Northline (notificação local); o Google usa o padrão da agenda
  body.reminders = { useDefault: true };
  return body;
}

serve('google-sync', async (req) => {
  const { user } = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient(); // operações restritas a user_id = usuário autenticado em todas as consultas
  const { data: integ } = await db.from('integrations').select('calendar_id, status').eq('user_id', user.id).eq('provider', 'google_calendar').maybeSingle();
  if (!integ || integ.status !== 'connected') throw new HttpError(409, 'Google Agenda não conectado.', 'google_not_connected');
  const secrets = await loadSecrets(user.id);
  if (!secrets) throw new HttpError(409, 'Credenciais do Google ausentes. Reconecte.', 'google_revoked');
  const token = await accessToken(user.id, secrets);
  const cal = encodeURIComponent(integ.calendar_id);
  const { data: profile } = await db.from('profiles').select('timezone').eq('id', user.id).maybeSingle();
  const tz = profile?.timezone ?? 'America/Recife';

  if (body.action === 'resolve') {
    const { data: c } = await db.from('sync_conflicts').select('*').eq('id', String(body.conflictId)).eq('user_id', user.id).is('resolved_at', null).maybeSingle();
    if (!c) throw new HttpError(404, 'Conflito não encontrado.');
    const { data: ev } = await db.from('events').select('*').eq('id', c.event_id).eq('user_id', user.id).maybeSingle();
    if (!ev) throw new HttpError(404, 'Evento não encontrado.');
    if (body.resolution === 'keep_local') {
      if (ev.status === 'cancelled') {
        await gapi(token, `/calendars/${cal}/events/${encodeURIComponent(ev.external_id)}`, { method: 'DELETE' }).catch(() => {});
        await db.from('events').delete().eq('id', ev.id).eq('user_id', user.id);
      } else {
        const updated = await gapi<RemoteEvent>(token, `/calendars/${cal}/events/${encodeURIComponent(ev.external_id)}`, { method: 'PUT', body: JSON.stringify(localToRemote(ev)) });
        await db.from('events').update({ external_etag: updated.etag, sync_status: 'synced' }).eq('id', ev.id).eq('user_id', user.id);
      }
    } else if (body.resolution === 'keep_remote') {
      try {
        const remote = await gapi<RemoteEvent>(token, `/calendars/${cal}/events/${encodeURIComponent(ev.external_id)}`);
        if (remote.status === 'cancelled') await db.from('events').delete().eq('id', ev.id).eq('user_id', user.id);
        else await db.from('events').update(remoteToColumns(remote, tz)).eq('id', ev.id).eq('user_id', user.id);
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) await db.from('events').delete().eq('id', ev.id).eq('user_id', user.id);
        else throw e;
      }
    } else throw new HttpError(400, 'Resolução inválida.');
    await db.from('sync_conflicts').update({ resolved_at: new Date().toISOString(), resolution: body.resolution }).eq('id', c.id);
    return json(req, { ok: true });
  }

  if (body.action !== 'sync') throw new HttpError(400, 'Ação inválida.');
  const summary = { imported: 0, updated: 0, pushed: 0, deleted: 0, conflicts: 0, fullResync: false };

  const { data: rows, error } = await db.from('events').select('*').eq('user_id', user.id).limit(10000);
  if (error) throw error;
  const locals = (rows ?? []) as LocalRow[];
  const byExternal = new Map(locals.filter((r) => r.external_id).map((r) => [r.external_id!, r]));
  const ownedSeries = new Set(locals.filter((r) => r.external_id && r.recurrence).map((r) => r.external_id!));

  const recordConflict = async (local: LocalRow, remote: RemoteEvent | null) => {
    const remoteRangeVal = remote ? remoteRange(remote) : null;
    await db.from('events').update({ sync_status: 'conflict' }).eq('id', local.id).eq('user_id', user.id);
    await db.from('sync_conflicts').insert({
      user_id: user.id,
      event_id: local.id,
      local_snapshot: { title: local.title, startAt: local.start_at, endAt: local.end_at, status: local.status },
      remote_snapshot: remote ? { title: remote.summary ?? '(sem título)', startAt: remoteRangeVal?.startAt ?? local.start_at, endAt: remoteRangeVal?.endAt ?? local.end_at, status: remote.status ?? 'confirmed' } : { title: '(excluído no Google)', startAt: local.start_at, endAt: local.end_at, status: 'cancelled' },
    });
    summary.conflicts++;
  };

  // ---------- PULL ----------
  let pulled: { items: RemoteEvent[]; nextSyncToken: string | null };
  try {
    pulled = await listEvents(token, integ.calendar_id, secrets.syncToken);
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 410) {
      // syncToken inválido: sincronização completa (o índice único por external_id evita duplicatas)
      summary.fullResync = true;
      pulled = await listEvents(token, integ.calendar_id, null);
    } else if (e instanceof GoogleApiError && e.status === 401) {
      throw new HttpError(409, 'Acesso ao Google negado. Reconecte.', 'google_revoked');
    } else throw e;
  }

  const conflictedIds = new Set<string>();
  for (const remote of pulled.items) {
    const local = byExternal.get(remote.id);
    const decision = decidePull(remote, local ? toState(local) : undefined, ownedSeries);
    if (decision === 'import') {
      if (!remoteRange(remote)) continue;
      const { error: e } = await db.from('events').upsert({ ...remoteToColumns(remote, tz), user_id: user.id, source: 'google', category: 'other', reminder_minutes: null }, { onConflict: 'user_id,external_id', ignoreDuplicates: false });
      if (!e) summary.imported++;
    } else if (decision === 'update_local' && local) {
      if (!remoteRange(remote)) continue;
      await db.from('events').update(remoteToColumns(remote, tz)).eq('id', local.id).eq('user_id', user.id);
      summary.updated++;
    } else if (decision === 'delete_local' && local) {
      await db.from('events').delete().eq('id', local.id).eq('user_id', user.id);
      summary.deleted++;
    } else if (decision === 'conflict' && local) {
      if (local.sync_status !== 'conflict') await recordConflict(local, remote);
      conflictedIds.add(local.id);
    }
  }

  // ---------- PUSH ----------
  for (const local of locals) {
    if (conflictedIds.has(local.id)) continue;
    const action = decidePush(toState(local));
    try {
      if (action === 'insert') {
        const created = await gapi<RemoteEvent>(token, `/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(localToRemote(local)) });
        await db.from('events').update({ external_id: created.id, external_etag: created.etag, sync_status: 'synced' }).eq('id', local.id).eq('user_id', user.id);
        summary.pushed++;
      } else if (action === 'patch') {
        const updated = await gapi<RemoteEvent>(token, `/calendars/${cal}/events/${encodeURIComponent(local.external_id!)}`, { method: 'PATCH', body: JSON.stringify(localToRemote(local)), headers: local.external_etag ? { 'If-Match': local.external_etag } : {} });
        await db.from('events').update({ external_etag: updated.etag, sync_status: 'synced' }).eq('id', local.id).eq('user_id', user.id);
        summary.pushed++;
      } else if (action === 'delete_remote') {
        await gapi(token, `/calendars/${cal}/events/${encodeURIComponent(local.external_id!)}`, { method: 'DELETE', headers: local.external_etag ? { 'If-Match': local.external_etag } : {} });
        await db.from('events').delete().eq('id', local.id).eq('user_id', user.id);
        summary.deleted++;
      } else if (action === 'delete_local_only') {
        await db.from('events').delete().eq('id', local.id).eq('user_id', user.id);
      }
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 412) {
        // o evento mudou no Google desde a última leitura: não sobrescreve
        const remote = await gapi<RemoteEvent>(token, `/calendars/${cal}/events/${encodeURIComponent(local.external_id!)}`).catch(() => null);
        await recordConflict(local, remote);
      } else if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410) && action === 'delete_remote') {
        await db.from('events').delete().eq('id', local.id).eq('user_id', user.id);
      } else {
        await db.from('events').update({ sync_status: 'error' }).eq('id', local.id).eq('user_id', user.id);
        console.error('[google-sync] push', action, e instanceof GoogleApiError ? e.status : (e as Error).name);
      }
    }
  }

  await db.from('integration_secrets').update({ sync_token: pulled.nextSyncToken, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('provider', 'google_calendar');
  await db.from('integrations').update({ last_sync_at: new Date().toISOString(), last_error: null, status: 'connected' }).eq('user_id', user.id).eq('provider', 'google_calendar');
  return json(req, summary);
});
