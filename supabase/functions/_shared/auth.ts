import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0';
import { HttpError } from './http.ts';

const url = () => Deno.env.get('SUPABASE_URL')!;
const anon = () => Deno.env.get('SUPABASE_ANON_KEY')!;
const service = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface AuthContext {
  user: User;
  /** cliente com o JWT do usuário: toda consulta passa pelo RLS */
  db: SupabaseClient;
}

/**
 * Valida a sessão a partir do header Authorization. O user_id vem do token verificado,
 * nunca do corpo da requisição.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sessão ausente.', 'unauthenticated');
  const db = createClient(url(), anon(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida ou expirada.', 'unauthenticated');
  return { user: data.user, db };
}

/** Cliente privilegiado (service role). Usar só para operações que o RLS bloqueia de propósito. */
export function adminClient(): SupabaseClient {
  return createClient(url(), service(), { auth: { persistSession: false } });
}

export async function enforceLimit(userId: string, kind: 'request' | 'transcription', limit: number) {
  const { data, error } = await adminClient().rpc('increment_assistant_usage', { p_user: userId, p_kind: kind, p_limit: limit });
  if (error) throw new Error(`usage: ${error.message}`);
  if (data !== true) throw new HttpError(429, 'Limite diário de uso atingido. Tente amanhã.', 'rate_limited');
}
