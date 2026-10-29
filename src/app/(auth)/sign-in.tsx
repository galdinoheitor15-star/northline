import { useState } from 'react';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

export default function SignIn() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Informe um e-mail válido.');
    if (!password) return setError('Informe sua senha.');
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <Screen header={<Header title="Entrar" back />}>
      <TextField label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <TextField label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
      {error && (
        <Text tone="negative" variant="small" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Button label="Entrar" onPress={submit} loading={loading} style={{ marginTop: space.sm }} />
      <Button label="Esqueci minha senha" variant="ghost" onPress={() => router.push('/forgot-password')} />
      <Button label="Criar uma conta" variant="ghost" onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
