import { useState } from 'react';
import { View } from 'react-native';
import { Plus, Target, Trash2 } from 'lucide-react-native';
import { Button, IconButton } from '@/components/ui/Button';
import { DateField, TextField } from '@/components/ui/Input';
import { Card, EmptyState, ProgressBar, Row } from '@/components/ui/primitives';
import { confirm, Sheet, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { formatBRL, goalProgress, parseMoneyToCents } from '@/domain/finance';
import { diffDaysKeys, formatShortDate } from '@/domain/time';
import type { SavingsGoal } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { useData } from '@/state/data';
import { space } from '@/theme/tokens';

export default function Goals() {
  const { today } = useNow();
  const goals = useData((s) => s.goals);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [targetText, setTargetText] = useState('');
  const [contrib, setContrib] = useState<{ goal: SavingsGoal; text: string } | null>(null);
  const [error, setError] = useState<string>();

  const save = async () => {
    if (!editing) return;
    const cents = parseMoneyToCents(targetText);
    if (!editing.name.trim()) return setError('Dê um nome à meta.');
    if (!cents || cents <= 0) return setError('Informe o valor da meta.');
    if (await useData.getState().save('goals', { ...editing, name: editing.name.trim(), targetCents: cents, updatedAt: nowIso() })) {
      setEditing(null);
      toast.success('Meta salva.');
    }
  };

  const addContribution = async (sign: 1 | -1) => {
    if (!contrib) return;
    const cents = parseMoneyToCents(contrib.text);
    if (!cents || cents <= 0) return toast.error('Informe um valor.');
    const g = contrib.goal;
    if (await useData.getState().save('goals', { ...g, contributions: [...g.contributions, { id: newId(), amountCents: sign * cents, date: today }], updatedAt: nowIso() })) {
      setContrib(null);
      toast.success(sign > 0 ? 'Aporte registrado.' : 'Retirada registrada.');
    }
  };

  return (
    <Screen
      header={
        <Header
          title="Metas de economia"
          back
          right={
            <IconButton
              icon={Plus}
              label="Nova meta"
              tone="filled"
              onPress={() => {
                setEditing({ id: newId(), name: '', targetCents: 0, targetDate: null, contributions: [], archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
                setTargetText('');
                setError(undefined);
              }}
            />
          }
        />
      }
    >
      {goals.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title="Nenhuma meta" description="Defina um objetivo e registre os aportes. O progresso é a soma dos seus aportes." />
        </Card>
      ) : (
        goals.map((g) => {
          const p = goalProgress(g);
          const days = g.targetDate ? diffDaysKeys(g.targetDate, today) : null;
          return (
            <Card key={g.id}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{g.name}</Text>
                  <Text variant="small" tone="muted">
                    {formatBRL(p.saved)} de {formatBRL(g.targetCents)}
                    {g.targetDate ? ` · até ${formatShortDate(g.targetDate)}${days != null && days >= 0 ? ` (${days} dias)` : ''}` : ''}
                  </Text>
                </View>
                <IconButton
                  icon={Trash2}
                  label="Excluir meta"
                  size={34}
                  onPress={async () => {
                    if (await confirm({ title: 'Excluir meta?', message: 'Os aportes registrados nela serão apagados.', destructive: true, confirmLabel: 'Excluir' })) await useData.getState().remove('goals', g.id);
                  }}
                />
              </Row>
              <View style={{ marginVertical: space.md }}>
                <ProgressBar value={p.progress} tone="positive" height={8} />
              </View>
              <Row>
                <Text variant="small" tone="muted" style={{ flex: 1 }}>
                  {p.progress >= 1 ? 'Meta atingida.' : `Faltam ${formatBRL(p.remaining)}`}
                </Text>
                <Button label="Aporte" size="sm" variant="secondary" onPress={() => setContrib({ goal: g, text: '' })} />
                <Button label="Editar" size="sm" variant="ghost" onPress={() => { setEditing(g); setTargetText((g.targetCents / 100).toFixed(2).replace('.', ',')); setError(undefined); }} />
              </Row>
            </Card>
          );
        })
      )}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Meta">
        {editing && (
          <View style={{ gap: space.md }}>
            <TextField label="Nome" value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} error={error} placeholder="Ex.: Reserva de emergência" />
            <TextField label="Valor da meta (R$)" value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" placeholder="0,00" />
            <DateField label="Prazo (opcional)" value={editing.targetDate} onChange={(targetDate) => setEditing({ ...editing, targetDate })} today={today} allowEmpty />
            <Button label="Salvar meta" onPress={save} />
          </View>
        )}
      </Sheet>
      <Sheet visible={!!contrib} onClose={() => setContrib(null)} title={contrib ? `Movimentar: ${contrib.goal.name}` : ''}>
        {contrib && (
          <View style={{ gap: space.md }}>
            <TextField label="Valor (R$)" value={contrib.text} onChangeText={(text) => setContrib({ ...contrib, text })} keyboardType="decimal-pad" autoFocus placeholder="0,00" />
            <Row>
              <Button label="Aportar" style={{ flex: 1 }} onPress={() => addContribution(1)} />
              <Button label="Retirar" variant="secondary" style={{ flex: 1 }} onPress={() => addContribution(-1)} />
            </Row>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
