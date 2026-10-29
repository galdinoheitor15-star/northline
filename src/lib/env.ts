// Somente variáveis públicas (EXPO_PUBLIC_*) chegam ao app. Segredos ficam nas Edge Functions.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
};

export const isSupabaseConfigured = /^https:\/\/.+/.test(env.supabaseUrl) && env.supabaseAnonKey.length > 20;

export const functionsUrl = isSupabaseConfigured ? `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1` : '';
