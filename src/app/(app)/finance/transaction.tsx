import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Button, IconButton } from '@/components/ui/Button';
import { DateField, Field, TextField } from '@/components/ui/Input';
import { Chip, ChipRow, Segmented, ToggleRow } from '@/components/ui/primitives';
import { confirm, toast } from '@/components/ui/Overlay';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { EXPENSE_CATEGORIES, formatBRL, INCOME_CATEGORIES, parseMoneyToCents, PAYMENT_METHODS, validateTransaction } from '@/domain/finance';
import type { RecurringTransaction, Transaction, TransactionType } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { newId, nowIso } from '@/lib/id';
import { newTransaction } from '@/state/actions';
import { useData } from '@/state/data';

export default function TransactionForm() {
  const params = useLocalSearchParams<{ id?: string; type?: TransactionType }>();
  const { today } = useNow();
  const accounts = useData((s) => s.accounts.filter((a) => !a.archivedAt));
  const existing = useData((s) => s.transactions.find((t) => t.id === params.id));
  const recurringRule = useData((s) => s.recurring.find((r) => r.id === existing?.recurringId));
  const [t, setT] = useState<Transaction>(() => existing ?? newTransaction({ type: params.type ?? 'expense', amountCents: 0, date: today, accountId: accounts[0]?.id ?? null, category: '' }));
  const [amountText, setAmountText] = useState(existing ? (existing.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [recurring, setRecurring] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Transaction>) => setT((x) => ({ ...x, ...p }));
  const cats = t.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const save = async () => {
    const cents = parseMoneyToCents(amountText) ?? 0;
    const tx: Transaction = { ...t, amountCents: cents, category: t.type === 'transfer' ? 'Transferência' : t.category, transferAccountId: t.type === 'transfer' ? t.transferAccountId : null, updatedAt: nowIso() };
    const e = validateTransaction(tx);
    if (tx.date > today && !recurring) e.date = 'Use uma data até hoje (lançamentos futuros: marque como recorrente).';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const data = useData.getState();
    let ok: boolean;
    if (recurring && !existing && tx.type !== 'transfer') {
      // cria a regra e deixa a materialização gerar os lançamentos vencidos (incluindo o de hoje)
      const rule: RecurringTransaction = { id: newId(), accountId: tx.accountId, type: tx.type, amountCents: cents, category: tx.category, description: tx.description, paymentMethod: tx.paymentMethod, recurrence: { freq: 'monthly', interval: 1 }, startDate: tx.date, active: true, createdAt: nowIso(), updatedAt: nowIso() };
      ok = await data.save('recurring', rule);
      if (ok && tx.date <= today) ok = await data.save('transactions', { ...tx, recurringId: rule.id });
    } else ok = await data.save('transactions', tx);
    setSaving(false);
    if (ok) {
      toast.success(existing ? 'Lançamento atualizado.' : 'Lançamento registrado.');
      router.back();
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm({ title: 'Excluir lançamento?', message: `${formatBRL(existing.amountCents)} · ${existing.description ?? existing.category}`, destructive: true, confirmLabel: 'Excluir' }))) return;
    if (await useData.getState().remove('transactions', existing.id)) router.back();
  };

  const stopRecurring = async () => {
    if (!recurringRule) return;
    if (!(await confirm({ title: 'Encerrar recorrência?', message: 'Lançamentos já registrados são mantidos; novos deixam de ser gerados.', confirmLabel: 'Encerrar' }))) return;
    await useData.getState().save('recurring', { ...recurringRule, active: false, updatedAt: nowIso() });
    toast.show('Recorrência encerrada.');
  };

  return (
    <Screen header={<Header title={existing ? 'Editar lançamento' : 'Nova movimentação'} back right={existing ? <IconButton icon={Trash2} label="Excluir lançamento" onPress={remove} /> : undefined} />} footer={<Button label="Salvar" onPress={save} loading={saving} />}>
      <Segmented
        options={[
          { value: 'expense', label: 'Despesa' },
          { value: 'income', label: 'Receita' },
          { value: 'transfer', label: 'Transferência' },
        ]}
        value={t.type}
        onChange={(type) => patch({ type, category: '' })}
      />
      <TextField label="Valor (R$)" value={amountText} onChangeText={(v) => setAmountText(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder="0,00" error={errors.amount} hint={parseMoneyToCents(amountText) ? formatBRL(parseMoneyToCents(amountText)!) : undefined} autoFocus={!existing} />
      {t.type !== 'transfer' && (
        <Field label="Categoria" error={errors.category}>
          <ChipRow>
            {cats.map((c) => (
              <Chip key={c} label={c} selected={t.category === c} onPress={() => patch({ category: c })} />
            ))}
          </ChipRow>
        </Field>
      )}
      <TextField label="Descrição" value={t.description ?? ''} onChangeText={(v) => patch({ description: v || null })} placeholder="Ex.: Mercado" maxLength={300} />
      <DateField label="Data" value={t.date} onChange={(date) => date && patch({ date })} today={today} error={errors.date} />
      {accounts.length === 0 ? (
        <Text variant="small" tone="muted">
          Sem contas cadastradas: o lançamento ficará sem conta. Cadastre em Finanças › Contas.
        </Text>
      ) : (
        <Field label={t.type === 'transfer' ? 'De' : 'Conta'} error={errors.account}>
          <ChipRow>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={t.accountId === a.id} onPress={() => patch({ accountId: a.id })} />
            ))}
          </ChipRow>
        </Field>
      )}
      {t.type === 'transfer' && (
        <Field label="Para">
          <ChipRow>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={t.transferAccountId === a.id} onPress={() => patch({ transferAccountId: a.id })} />
            ))}
          </ChipRow>
        </Field>
      )}
      {t.type !== 'transfer' && (
        <Field label="Forma de pagamento (opcional)">
          <ChipRow>
            {PAYMENT_METHODS.map((p) => (
              <Chip key={p} label={p} selected={t.paymentMethod === p} onPress={() => patch({ paymentMethod: t.paymentMethod === p ? null : p })} />
            ))}
          </ChipRow>
        </Field>
      )}
      {!existing && t.type !== 'transfer' && <ToggleRow title="Repetir todo mês" subtitle="Gera o lançamento automaticamente na mesma data de cada mês." value={recurring} onChange={setRecurring} />}
      {recurringRule?.active && <Button label="Encerrar recorrência mensal" variant="ghost" onPress={stopRecurring} />}
    </Screen>
  );
}
