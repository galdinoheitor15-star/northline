import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { env, functionsUrl, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/** Cliente com a chave pública (anon). Toda leitura/escrita passa pelo RLS do banco. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return client;
}

export class FunctionError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Chama uma Edge Function com o JWT do usuário; o backend valida a sessão em toda chamada. */
export async function callFunction<T>(name: string, body: unknown, init?: { formData?: FormData; timeoutMs?: number }): Promise<T> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FunctionError('Sessão expirada. Entre novamente.', 401, 'unauthenticated');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 45_000);
  try {
    const res = await fetch(`${functionsUrl}/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: env.supabaseAnonKey, ...(init?.formData ? {} : { 'Content-Type': 'application/json' }) },
      body: init?.formData ?? JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new FunctionError(json.error ?? `Erro ${res.status}`, res.status, json.code);
    return json as T;
  } catch (e) {
    if (e instanceof FunctionError) throw e;
    if ((e as Error).name === 'AbortError') throw new FunctionError('O servidor demorou para responder. Tente novamente.', 408, 'timeout');
    throw new FunctionError('Sem conexão com o servidor.', 0, 'network');
  } finally {
    clearTimeout(timer);
  }
}
