import { useState } from 'react';
import { View } from 'react-native';
import { Archive, Landmark, Plus } from 'lucide-react-native';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, TextField } from '@/components/ui/Input';
import { Card, Chip, ChipRow, EmptyState, Row } from '@/components/ui/primitives';
import { confirm, Sheet, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { accountBalance, formatBRL, parseMoneyToCents } from '@/domain/finance';
import type { AccountType, FinanceAccount } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { useData } from '@/state/data';
import { space } from '@/theme/tokens';

const TYPES: { id: AccountType; label: string }[] = [
  { id: 'checking', label: 'Corrente' },
  { id: 'savings', label: 'Poupança' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit', label: 'Cartão' },
  { id: 'investment', label: 'Investimento' },
  { id: 'other', label: 'Outra' },
];

export default function Accounts() {
  const { today } = useNow();
  const accounts = useData((s) => s.accounts);
  const txs = useData((s) => s.transactions);
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [balanceText, setBalanceText] = useState('');
  const [error, setError] = useState<string>();

  const openNew = () => {
    setEditing({ id: newId(), name: '', type: 'checking', initialBalanceCents: 0, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
    setBalanceText('');
    setError(undefined);
  };
  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return setError('Dê um nome à conta.');
    const cents = balanceText.trim() ? parseMoneyToCents(balanceText) : 0;
    if (cents === null) return setError('Saldo inicial inválido.');
    if (await useData.getState().save('accounts', { ...editing, name: editing.name.trim(), initialBalanceCents: cents, updatedAt: nowIso() })) {
      setEditing(null);
      toast.success('Conta salva.');
    }
  };
  const archive = async (a: FinanceAccount) => {
    if (!(await confirm({ title: a.archivedAt ? 'Reativar conta?' : 'Arquivar conta?', message: 'Os lançamentos continuam no histórico e no saldo.', confirmLabel: a.archivedAt ? 'Reativar' : 'Arquivar' }))) return;
    await useData.getState().save('accounts', { ...a, archivedAt: a.archivedAt ? null : nowIso(), updatedAt: nowIso() });
  };

  return (
    <Screen header={<Header title="Contas" back right={<IconButton icon={Plus} label="Nova conta" tone="filled" onPress={openNew} />} />}>
      {accounts.length === 0 ? (
        <Card>
          <EmptyState icon={Landmark} title="Nenhuma conta" description="Informe o saldo atual de cada conta; daqui pra frente o saldo é calculado pelos lançamentos." action="Nova conta" onAction={openNew} />
        </Card>
      ) : (
        accounts.map((a) => (
          <Card key={a.id} onPress={() => { setEditing(a); setBalanceText((a.initialBalanceCents / 100).toFixed(2).replace('.', ',')); setError(undefined); }} accessibilityLabel={a.name}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" tone={a.archivedAt ? 'faint' : 'default'}>
                  {a.name}
                  {a.archivedAt ? ' (arquivada)' : ''}
                </Text>
                <Text variant="small" tone="muted">
                  {TYPES.find((t) => t.id === a.type)?.label} · saldo inicial {formatBRL(a.initialBalanceCents)}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ fontVariant: ['tabular-nums'] }}>
                {formatBRL(accountBalance(a, txs, today))}
              </Text>
              <IconButton icon={Archive} label={a.archivedAt ? 'Reativar' : 'Arquivar'} size={34} onPress={() => archive(a)} />
            </Row>
          </Card>
        ))
      )}
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing && accounts.some((a) => a.id === editing.id) ? 'Editar conta' : 'Nova conta'}>
        {editing && (
          <View style={{ gap: space.md }}>
            <TextField label="Nome" value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} placeholder="Ex.: Nubank" error={error} maxLength={60} />
            <Field label="Tipo">
              <ChipRow>
                {TYPES.map((t) => (
                  <Chip key={t.id} label={t.label} selected={editing.type === t.id} onPress={() => setEditing({ ...editing, type: t.id })} />
                ))}
              </ChipRow>
            </Field>
            <TextField label="Saldo inicial (R$)" value={balanceText} onChangeText={setBalanceText} keyboardType="numbers-and-punctuation" placeholder="0,00" hint="Use − para saldo negativo (ex.: fatura de cartão)." />
            <Button label="Salvar conta" onPress={save} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
