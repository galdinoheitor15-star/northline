import { useState } from 'react';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { Card } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

export default function SignUp() {
  const signUp = useSession((s) => s.signUp);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Como devemos te chamar?';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'E-mail inválido.';
    if (password.length < 8) e.password = 'Use pelo menos 8 caracteres.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    const r = await signUp(name, email, password);
    setLoading(false);
    if (r.error) setErrors({ form: r.error });
    else if (r.needsConfirmation) setSent(true);
  };

  if (sent) {
    return (
      <Screen header={<Header title="Confirme seu e-mail" back />}>
        <Card>
          <Text>Enviamos um link de confirmação para {email.trim()}. Abra o e-mail neste aparelho e depois entre com sua senha.</Text>
        </Card>
        <Button label="Ir para o login" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Criar conta" back />}>
      <TextField label="Nome" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
      <TextField label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} />
      <TextField label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={errors.password} hint="Mínimo de 8 caracteres." />
      {errors.form && (
        <Text tone="negative" variant="small">
          {errors.form}
        </Text>
      )}
      <Button label="Criar conta" onPress={submit} loading={loading} style={{ marginTop: space.sm }} />
      <Text variant="small" tone="faint" center>
        Ao criar a conta, seus dados ficam protegidos por usuário (RLS) e você pode excluí-los a qualquer momento em Configurações.
      </Text>
    </Screen>
  );
}
