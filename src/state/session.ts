import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { create } from 'zustand';
import { LocalRepository, SupabaseRepository, type Repository } from '@/data/repository';
import { buildDemoData } from '@/data/demo';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { useData } from './data';

export type Mode = 'supabase' | 'local' | 'demo';

interface SessionState {
  initializing: boolean;
  mode: Mode | null;
  user: { id: string; email: string | null } | null;
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(name: string, email: string, password: string): Promise<{ error: string | null; needsConfirmation: boolean }>;
  requestPasswordReset(email: string): Promise<string | null>;
  updatePassword(password: string): Promise<string | null>;
  startLocal(): Promise<void>;
  startDemo(): Promise<void>;
  signOut(): Promise<void>;
}

const MODE_KEY = 'nl:mode';

// Mensagens do Supabase Auth traduzidas para o usuário.
export function authErrorMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password should be')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão com o servidor.';
  return msg;
}

async function activate(mode: Mode, user: { id: string; email: string | null }) {
  const repo: Repository = mode === 'supabase' ? new SupabaseRepository(user.id) : new LocalRepository(mode === 'demo' ? 'demo' : 'local');
  useSession.setState({ mode, user });
  await useData.getState().hydrate(repo);
}

export const useSession = create<SessionState>((set, get) => ({
  initializing: true,
  mode: null,
  user: null,

  async init() {
    try {
      const saved = (await AsyncStorage.getItem(MODE_KEY)) as Mode | null;
      if (isSupabaseConfigured) {
        const sb = getSupabase();
        sb.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT' && get().mode === 'supabase') {
            useData.getState().reset();
            set({ mode: null, user: null });
          }
          if (event === 'SIGNED_IN' && session && get().mode !== 'supabase') {
            void AsyncStorage.setItem(MODE_KEY, 'supabase');
            void activate('supabase', { id: session.user.id, email: session.user.email ?? null });
          }
        });
        const { data } = await sb.auth.getSession();
        if (data.session) {
          await activate('supabase', { id: data.session.user.id, email: data.session.user.email ?? null });
          return;
        }
      }
      if (saved === 'local') await activate('local', { id: 'local', email: null });
      else if (saved === 'demo') await activate('demo', { id: 'demo', email: null });
    } finally {
      set({ initializing: false });
    }
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured) return 'Backend não configurado. Use o modo local ou configure o Supabase.';
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) return authErrorMessage(error.message);
    await AsyncStorage.setItem(MODE_KEY, 'supabase');
    await activate('supabase', { id: data.user.id, email: data.user.email ?? null });
    return null;
  },

  async signUp(name, email, password) {
    if (!isSupabaseConfigured) return { error: 'Backend não configurado.', needsConfirmation: false };
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: Linking.createURL('/sign-in') },
    });
    if (error) return { error: authErrorMessage(error.message), needsConfirmation: false };
    if (data.session) {
      await AsyncStorage.setItem(MODE_KEY, 'supabase');
      await activate('supabase', { id: data.session.user.id, email: data.session.user.email ?? null });
      return { error: null, needsConfirmation: false };
    }
    return { error: null, needsConfirmation: true };
  },

  async requestPasswordReset(email) {
    if (!isSupabaseConfigured) return 'Backend não configurado.';
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/reset-password') });
    return error ? authErrorMessage(error.message) : null;
  },

  async updatePassword(password) {
    const { error } = await getSupabase().auth.updateUser({ password });
    return error ? authErrorMessage(error.message) : null;
  },

  async startLocal() {
    await AsyncStorage.setItem(MODE_KEY, 'local');
    await activate('local', { id: 'local', email: null });
  },

  async startDemo() {
    const repo = new LocalRepository('demo');
    // dados de demonstração ficam num espaço separado e são recriados a cada entrada
    await repo.clear();
    const demo = buildDemoData(new Date());
    for (const [c, items] of Object.entries(demo.snapshot)) if ((items as unknown[]).length) await repo.upsert(c as never, items as never[]);
    await repo.saveProfile(demo.profile);
    await AsyncStorage.setItem(MODE_KEY, 'demo');
    await activate('demo', { id: 'demo', email: null });
  },

  async signOut() {
    const mode = get().mode;
    await AsyncStorage.removeItem(MODE_KEY);
    if (mode === 'supabase') await getSupabase().auth.signOut();
    if (mode === 'demo') await new LocalRepository('demo').clear();
    useData.getState().reset();
    set({ mode: null, user: null });
  },
}));
