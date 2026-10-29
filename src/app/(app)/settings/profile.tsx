import { useState } from 'react';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Field, TextField } from '@/components/ui/Input';
import { Chip, ChipRow } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useData } from '@/state/data';
import { useSession } from '@/state/session';

const TIMEZONES = ['America/Recife', 'America/Sao_Paulo', 'America/Fortaleza', 'America/Bahia', 'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon', 'America/New_York'];

function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export default function Profile() {
  const profile = useData((s) => s.profile);
  const email = useSession((s) => s.user?.email);
  const [name, setName] = useState(profile.displayName);
  const [tz, setTz] = useState(profile.timezone);
  const [weekStartsOn, setWeek] = useState(profile.weekStartsOn);
  const [error, setError] = useState<string>();

  const save = async () => {
    if (!validTz(tz)) return setError('Fuso horário inválido (use o formato IANA, ex.: America/Recife).');
    if (await useData.getState().updateProfile({ displayName: name.trim().slice(0, 80), timezone: tz, weekStartsOn })) {
      toast.success('Perfil salvo.');
      router.back();
    }
  };

  return (
    <Screen header={<Header title="Perfil" back />} footer={<Button label="Salvar" onPress={save} />}>
      <TextField label="Nome" value={name} onChangeText={setName} maxLength={80} />
      {email && (
        <Text variant="small" tone="muted">
          E-mail: {email}
        </Text>
      )}
      <Field label="Fuso horário" hint="Datas e lembretes usam este fuso. Eventos guardam o próprio fuso.">
        <ChipRow>
          {TIMEZONES.map((t) => (
            <Chip key={t} label={t.replace('America/', '').replace('Europe/', '').replace('_', ' ')} selected={tz === t} onPress={() => setTz(t)} />
          ))}
        </ChipRow>
      </Field>
      <TextField label="Outro fuso (IANA)" value={tz} onChangeText={setTz} autoCapitalize="none" error={error} />
      <Field label="A semana começa em">
        <ChipRow>
          <Chip label="Segunda" selected={weekStartsOn === 1} onPress={() => setWeek(1)} />
          <Chip label="Domingo" selected={weekStartsOn === 0} onPress={() => setWeek(0)} />
        </ChipRow>
      </Field>
      <Text variant="small" tone="faint">
        Idioma: português (Brasil) · Moeda: real (BRL)
      </Text>
    </Screen>
  );
}
