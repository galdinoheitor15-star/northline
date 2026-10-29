// OAuth 2.0 do Google Agenda, intermediado pelo backend.
// POST {action:'start'}      -> URL de consentimento (usuário autenticado)
// GET  ?code&state           -> callback do Google: troca o código, cifra e guarda os tokens
// POST {action:'disconnect'} -> revoga e apaga os tokens
// Esta função roda com verify_jwt = false (o Google chama o callback sem JWT); o POST valida o JWT manualmente.
import { adminClient, requireUser } from '../_shared/auth.ts';
import { encrypt, signState, verifyState } from '../_shared/crypto.ts';
import { exchangeCode, GOOGLE_SCOPES, loadSecrets, redirectUri, revokeToken } from '../_shared/google.ts';
import { HttpError, json, requireEnv, serve } from '../_shared/http.ts';

// Evita redirecionamento aberto: só volta para o app ou para origens configuradas.
function allowedReturn(url: string): boolean {
  const extra = (Deno.env.get('ALLOWED_RETURN_URLS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return /^(northline|exp|exps):\/\//.test(url) || /^http:\/\/localhost(:\d+)?\//.test(url) || extra.some((p) => url.startsWith(p));
}

function withParam(url: string, key: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function page(message: string, returnTo: string | null): Response {
  // redireciona direto para o app (o navegador de autenticação do Expo captura o esquema northline://)
  if (returnTo) return new Response(null, { status: 302, headers: { Location: returnTo } });
  const target = returnTo ? `<p><a href="${returnTo.replace(/"/g, '')}">Voltar ao Northline</a></p><script>location.href=${JSON.stringify(returnTo)}</script>` : '<p>Você já pode fechar esta janela.</p>';
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Northline</title><body style="background:#09090A;color:#F2F2F3;font-family:system-ui;padding:32px"><h2>Northline</h2><p>${message}</p>${target}</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

serve('google-oauth', async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    const payload = await verifyState<{ uid: string; returnTo: string }>(state);
    if (!payload) return page('Link de autorização inválido ou expirado. Tente conectar novamente.', null);
    if (url.searchParams.get('error')) return page('A conexão foi cancelada.', withParam(payload.returnTo, 'google', 'cancelled'));
    const code = url.searchParams.get('code');
    if (!code) return page('Resposta do Google sem código.', withParam(payload.returnTo, 'google', 'error'));

    const tokens = await exchangeCode(code);
    let email: string | null = null;
    if (tokens.id_token) {
      // id_token recebido diretamente do endpoint do Google por TLS
      try {
        email = JSON.parse(atob(tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null;
      } catch {
        email = null;
      }
    }
    const db = adminClient();
    const previous = await loadSecrets(payload.uid);
    const { error: e1 } = await db.from('integration_secrets').upsert({
      user_id: payload.uid,
      provider: 'google_calendar',
      access_token_enc: await encrypt(tokens.access_token),
      // o Google só devolve refresh_token na primeira autorização: preserva o anterior
      refresh_token_enc: tokens.refresh_token ? await encrypt(tokens.refresh_token) : previous?.refresh ? await encrypt(previous.refresh) : null,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      sync_token: null,
      updated_at: new Date().toISOString(),
    });
    if (e1) throw e1;
    const { error: e2 } = await db.from('integrations').upsert({ user_id: payload.uid, provider: 'google_calendar', account_email: email, status: 'connected', last_error: null }, { onConflict: 'user_id,provider' });
    if (e2) throw e2;
    return page('Google Agenda conectado.', withParam(payload.returnTo, 'google', 'connected'));
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const { user } = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'start') {
    const returnTo = String(body.returnTo ?? '');
    if (!allowedReturn(returnTo)) throw new HttpError(400, 'Endereço de retorno não permitido.', 'invalid_input');
    const state = await signState({ uid: user.id, returnTo, exp: Date.now() + 10 * 60_000 });
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    }).toString();
    return json(req, { url: auth.toString() });
  }

  if (body.action === 'disconnect') {
    const db = adminClient();
    const secrets = await loadSecrets(user.id);
    if (secrets) await revokeToken(secrets.refresh ?? secrets.access);
    await db.from('integration_secrets').delete().eq('user_id', user.id).eq('provider', 'google_calendar');
    await db.from('integrations').delete().eq('user_id', user.id).eq('provider', 'google_calendar');
    // eventos importados continuam como eventos locais
    await db.from('events').update({ external_id: null, external_etag: null, sync_status: 'local' }).eq('user_id', user.id).not('external_id', 'is', null);
    await db.from('sync_conflicts').delete().eq('user_id', user.id);
    return json(req, { ok: true });
  }

  throw new HttpError(400, 'Ação inválida.', 'invalid_input');
});
