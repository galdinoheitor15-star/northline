import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Overlay';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/state/session';

/** Destino do link de recuperação: troca o token do link por uma sessão e define a nova senha. */
export default function ResetPassword() {
  const url = Linking.useLinkingURL();
  const updatePassword = useSession((s) => s.updatePassword);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !url) return;
    const sb = getSupabase();
    (async () => {
      const parsed = new URL(url.replace('#', '?'));
      const code = parsed.searchParams.get('code');
      const access = parsed.searchParams.get('access_token');
      const refresh = parsed.searchParams.get('refresh_token');
      if (code) {
        const { error: e } = await sb.auth.exchangeCodeForSession(code);
        if (e) return setError('Link inválido ou expirado.');
      } else if (access && refresh) {
        const { error: e } = await sb.auth.setSession({ access_token: access, refresh_token: refresh });
        if (e) return setError('Link inválido ou expirado.');
      }
      const { data } = await sb.auth.getSession();
      if (data.session) setReady(true);
      else setError('Abra este link a partir do e-mail de recuperação.');
    })().catch(() => setError('Link inválido ou expirado.'));
  }, [url]);

  const submit = async () => {
    if (password.length < 8) return setError('Use pelo menos 8 caracteres.');
    setLoading(true);
    const err = await updatePassword(password);
    setLoading(false);
    if (err) return setError(err);
    toast.success('Senha atualizada.');
    router.replace('/');
  };

  return (
    <Screen header={<Header title="Nova senha" back />}>
      {!isSupabaseConfigured && <Text tone="muted">Backend não configurado.</Text>}
      {ready ? (
        <>
          <TextField label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Button label="Salvar nova senha" onPress={submit} loading={loading} />
        </>
      ) : (
        !error && <Text tone="muted">Validando o link…</Text>
      )}
      {error && <Text tone="negative">{error}</Text>}
    </Screen>
  );
}
