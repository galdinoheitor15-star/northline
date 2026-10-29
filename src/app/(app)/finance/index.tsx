import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Landmark, Plus, Target, Wallet } from 'lucide-react-native';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, EmptyState, ProgressBar, Row, SectionHeader, Stat } from '@/components/ui/primitives';
import { Header, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { accountBalance, expensesByCategory, formatBRL, goalProgress, monthRange, percentChange, periodTotals, previousMonthRange, totalBalance } from '@/domain/finance';
import { addMonthsKey, MONTHS_LONG, parseKey, relativeDayLabel, startOfMonthKey } from '@/domain/time';
import type { TransactionType } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

export default function Finance() {
  const { today } = useNow();
  const d = useData();
  const [month, setMonth] = useState(startOfMonthKey(today));
  const [type, setType] = useState<TransactionType | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const { from, to } = monthRange(month);
  const prev = previousMonthRange(month);
  const totals = periodTotals(d.transactions, from, to);
  const prevTotals = periodTotals(d.transactions, prev.from, prev.to);
  const expChange = percentChange(totals.expense, prevTotals.expense);
  const byCat = expensesByCategory(d.transactions, from, to);
  const balance = totalBalance(d.accounts, d.transactions, today);
  const { y, m } = parseKey(month);
  const accountName = (id: string | null) => d.accounts.find((a) => a.id === id)?.name ?? 'Sem conta';

  const list = useMemo(
    () =>
      d.transactions
        .filter((t) => t.date >= from && t.date <= to && (!type || t.type === type) && (!category || t.category === category))
        .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)),
    [d.transactions, from, to, type, category],
  );
  const empty = d.transactions.length === 0 && d.accounts.length === 0;

  return (
    <Screen header={<Header title="Finanças" back right={<IconButton icon={Plus} label="Nova movimentação" tone="filled" onPress={() => router.push('/finance/transaction')} />} />}>
      {empty ? (
        <Card>
          <EmptyState icon={Wallet} title="Comece pelas suas contas" description="Cadastre uma conta com o saldo atual e registre receitas e despesas. Tudo é calculado a partir dos seus lançamentos." action="Cadastrar conta" onAction={() => router.push('/finance/accounts')} />
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="small" tone="muted">
              Saldo calculado (todas as contas, até hoje)
            </Text>
            <Text variant="number" tone={balance < 0 ? 'negative' : 'default'} style={{ fontSize: 32, lineHeight: 38 }}>
              {formatBRL(balance)}
            </Text>
            <Row style={{ marginTop: space.md }}>
              <Button label="Receita" size="sm" variant="secondary" icon={ArrowDownLeft} style={{ flex: 1 }} onPress={() => router.push('/finance/transaction?type=income')} />
              <Button label="Despesa" size="sm" variant="secondary" icon={ArrowUpRight} style={{ flex: 1 }} onPress={() => router.push('/finance/transaction?type=expense')} />
              <Button label="Transferir" size="sm" variant="secondary" icon={ArrowLeftRight} style={{ flex: 1 }} onPress={() => router.push('/finance/transaction?type=transfer')} />
            </Row>
          </Card>

          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon={ChevronLeft} label="Mês anterior" onPress={() => setMonth(addMonthsKey(month, -1)!)} />
            <Text variant="bodyMedium">
              {MONTHS_LONG[m - 1].charAt(0).toUpperCase() + MONTHS_LONG[m - 1].slice(1)} de {y}
            </Text>
            <IconButton icon={ChevronRight} label="Próximo mês" onPress={() => setMonth(addMonthsKey(month, 1)!)} />
          </Row>

          <Card>
            <Row>
              <Stat label="Receitas" value={formatBRL(totals.income)} tone="positive" />
              <Stat label="Despesas" value={formatBRL(totals.expense)} />
            </Row>
            <Row style={{ marginTop: space.md }}>
              <Stat label="Resultado" value={formatBRL(totals.net, { sign: true })} tone={totals.net < 0 ? 'negative' : totals.net > 0 ? 'positive' : 'default'} />
              <Stat
                label="Despesas vs. mês anterior"
                value={expChange == null ? '—' : `${expChange > 0 ? '+' : ''}${Math.round(expChange * 100)}%`}
                tone={expChange == null ? 'muted' : expChange > 0 ? 'negative' : 'positive'}
                hint={`Anterior: ${formatBRL(prevTotals.expense)}`}
              />
            </Row>
          </Card>

          {byCat.length > 0 && (
            <Card>
              <SectionHeader title="Despesas por categoria" />
              <View style={{ gap: space.md }}>
                {byCat.map((c) => (
                  <Pressable key={c.category} accessibilityRole="button" onPress={() => setCategory(category === c.category ? null : c.category)} style={{ gap: 6, opacity: category && category !== c.category ? 0.45 : 1 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="small">{c.category}</Text>
                      <Text variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {formatBRL(c.cents)} · {Math.round(c.share * 100)}%
                      </Text>
                    </Row>
                    <ProgressBar value={c.share} />
                  </Pressable>
                ))}
              </View>
            </Card>
          )}

          <Card>
            <SectionHeader title="Contas" icon={Landmark} action="Gerenciar" onAction={() => router.push('/finance/accounts')} />
            {d.accounts.filter((a) => !a.archivedAt).map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text variant="small">{a.name}</Text>
                <Text variant="smallMedium" tone={accountBalance(a, d.transactions, today) < 0 ? 'negative' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                  {formatBRL(accountBalance(a, d.transactions, today))}
                </Text>
              </Row>
            ))}
            {d.accounts.length === 0 && (
              <Text variant="small" tone="muted">
                Nenhuma conta cadastrada.
              </Text>
            )}
          </Card>

          <Card>
            <SectionHeader title="Metas de economia" icon={Target} action="Ver metas" onAction={() => router.push('/finance/goals')} />
            {d.goals.filter((g) => !g.archivedAt).length === 0 ? (
              <Text variant="small" tone="muted">
                Nenhuma meta ainda.
              </Text>
            ) : (
              d.goals
                .filter((g) => !g.archivedAt)
                .map((g) => {
                  const p = goalProgress(g);
                  return (
                    <View key={g.id} style={{ gap: 6, paddingVertical: 6 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text variant="small">{g.name}</Text>
                        <Text variant="small" tone="muted">
                          {formatBRL(p.saved)} de {formatBRL(g.targetCents)}
                        </Text>
                      </Row>
                      <ProgressBar value={p.progress} tone="positive" />
                    </View>
                  );
                })
            )}
          </Card>

          <Card>
            <SectionHeader title="Movimentações" />
            <Row gap={space.sm} wrap style={{ marginBottom: space.sm }}>
              <Chip label="Todas" selected={!type} onPress={() => setType(null)} />
              <Chip label="Receitas" selected={type === 'income'} onPress={() => setType('income')} />
              <Chip label="Despesas" selected={type === 'expense'} onPress={() => setType('expense')} />
              <Chip label="Transferências" selected={type === 'transfer'} onPress={() => setType('transfer')} />
              {category && <Chip label={`× ${category}`} selected onPress={() => setCategory(null)} />}
            </Row>
            {list.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma movimentação neste período" action="Registrar" onAction={() => router.push('/finance/transaction')} />
            ) : (
              list.map((t) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/finance/transaction?id=${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, backgroundColor: pressed ? colors.surface2 : 'transparent', borderRadius: radius.sm })}>
                  <View style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: t.type === 'income' ? colors.positiveDim : colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
                    {t.type === 'income' ? <ArrowDownLeft size={16} color={colors.positive} /> : t.type === 'transfer' ? <ArrowLeftRight size={16} color={colors.textMuted} /> : <ArrowUpRight size={16} color={colors.textMuted} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {t.description || t.category}
                    </Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {relativeDayLabel(t.date, today)} · {t.type === 'transfer' ? `${accountName(t.accountId)} → ${accountName(t.transferAccountId)}` : `${t.category} · ${accountName(t.accountId)}`}
                      {t.recurringId ? ' · recorrente' : ''}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" tone={t.type === 'income' ? 'positive' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                    {formatBRL(t.amountCents)}
                  </Text>
                </Pressable>
              ))
            )}
          </Card>
          <Text variant="small" tone="faint" center>
            Integração bancária automática não faz parte desta versão.
          </Text>
        </>
      )}
    </Screen>
  );
}
