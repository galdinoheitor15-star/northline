// Exclusão de conta: revoga a integração com o Google e apaga o usuário.
// As tabelas referenciam auth.users com ON DELETE CASCADE, então todos os dados são removidos.
import { adminClient, requireUser } from '../_shared/auth.ts';
import { loadSecrets, revokeToken } from '../_shared/google.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

serve('delete-account', async (req) => {
  const { user } = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'EXCLUIR') throw new HttpError(400, 'Confirmação ausente.', 'invalid_input');
  const secrets = await loadSecrets(user.id).catch(() => null);
  if (secrets) await revokeToken(secrets.refresh ?? secrets.access);
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) throw new HttpError(500, 'Não foi possível excluir a conta agora.', 'delete_failed');
  return json(req, { ok: true });
});
