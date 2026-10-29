import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { Card } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/state/session';

export default function ForgotPassword() {
  const request = useSession((s) => s.requestPasswordReset);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Informe um e-mail válido.');
    setLoading(true);
    const err = await request(email);
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <Screen header={<Header title="Recuperar senha" back />}>
      {sent ? (
        <Card>
          <Text>Se houver uma conta para {email.trim()}, você receberá um link para criar uma nova senha.</Text>
        </Card>
      ) : (
        <>
          <Text tone="muted">Enviaremos um link para redefinir sua senha.</Text>
          <TextField label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={error ?? undefined} />
          <Button label="Enviar link" onPress={submit} loading={loading} />
        </>
      )}
    </Screen>
  );
}
