import { expandDates } from './recurrence';
import { addMonthsKey, endOfMonthKey, startOfMonthKey } from './time';
import type { DateKey, FinanceAccount, RecurringTransaction, SavingsGoal, Transaction } from './types';

export const EXPENSE_CATEGORIES = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Contas', 'Outros'];
export const INCOME_CATEGORIES = ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Reembolso', 'Outros'];
export const PAYMENT_METHODS = ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Boleto', 'Transferência'];

/**
 * Converte texto digitado em centavos inteiros sem passar por ponto flutuante.
 * Aceita "35", "35,5", "35,50", "1.234,56", "R$ 1234.56".
 */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/r\$|\s/gi, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let decPart = '';
  const sepIndex = Math.max(lastComma, lastDot);
  const decimals = sepIndex >= 0 ? s.length - sepIndex - 1 : 0;
  if (sepIndex >= 0 && decimals > 0 && decimals <= 2 && !(s[sepIndex] === '.' && decimals === 3)) {
    intPart = s.slice(0, sepIndex).replace(/[.,]/g, '');
    decPart = s.slice(sepIndex + 1);
  } else {
    intPart = s.replace(/[.,]/g, '');
  }
  if (!intPart && !decPart) return null;
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function formatBRL(cents: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const c = String(abs % 100).padStart(2, '0');
  const sign = cents < 0 ? '−' : opts.sign && cents > 0 ? '+' : '';
  return `${sign}R$ ${reais},${c}`;
}

/** Efeito do lançamento no saldo de uma conta específica (ou no total, se accountId = null). */
export function signedAmount(t: Transaction, accountId?: string | null): number {
  if (t.type === 'income') return accountId === undefined || t.accountId === accountId ? t.amountCents : 0;
  if (t.type === 'expense') return accountId === undefined || t.accountId === accountId ? -t.amountCents : 0;
  // transferência: neutra no total, debita a origem e credita o destino
  if (accountId === undefined) return 0;
  if (t.accountId === accountId) return -t.amountCents;
  if (t.transferAccountId === accountId) return t.amountCents;
  return 0;
}

export function accountBalance(account: FinanceAccount, txs: Transaction[], upTo?: DateKey): number {
  return txs.filter((t) => !upTo || t.date <= upTo).reduce((acc, t) => acc + signedAmount(t, account.id), account.initialBalanceCents);
}

export function totalBalance(accounts: FinanceAccount[], txs: Transaction[], upTo?: DateKey): number {
  const initial = accounts.reduce((a, c) => a + c.initialBalanceCents, 0);
  return txs.filter((t) => !upTo || t.date <= upTo).reduce((acc, t) => acc + signedAmount(t), initial);
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export function periodTotals(txs: Transaction[], from: DateKey, to: DateKey): PeriodTotals {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    if (t.type === 'income') income += t.amountCents;
    else if (t.type === 'expense') expense += t.amountCents;
    else continue;
    count++;
  }
  return { income, expense, net: income - expense, count };
}

export function monthRange(key: DateKey): { from: DateKey; to: DateKey } {
  return { from: startOfMonthKey(key), to: endOfMonthKey(key) };
}

export function previousMonthRange(key: DateKey): { from: DateKey; to: DateKey } {
  return monthRange(addMonthsKey(startOfMonthKey(key), -1)!);
}

export function expensesByCategory(txs: Transaction[], from: DateKey, to: DateKey): { category: string; cents: number; share: number }[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || t.date < from || t.date > to) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amountCents);
    total += t.amountCents;
  }
  return [...map.entries()].map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 })).sort((a, b) => b.cents - a.cents);
}

/** Variação percentual entre períodos (null quando o período anterior é zero). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function goalProgress(g: SavingsGoal): { saved: number; remaining: number; progress: number } {
  const saved = g.contributions.reduce((a, c) => a + c.amountCents, 0);
  return { saved, remaining: Math.max(0, g.targetCents - saved), progress: g.targetCents > 0 ? Math.min(1, saved / g.targetCents) : 0 };
}

/**
 * Gera os lançamentos de despesas/receitas recorrentes vencidos até `today`
 * que ainda não existem (idempotente: chave recurringId + data).
 */
export function materializeRecurring(rules: RecurringTransaction[], existing: Transaction[], today: DateKey, nowIso: string, newId: () => string): Transaction[] {
  const have = new Set(existing.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  const out: Transaction[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    for (const date of expandDates(r.startDate, r.recurrence, r.startDate, today)) {
      const k = `${r.id}|${date}`;
      if (have.has(k)) continue;
      have.add(k);
      out.push({
        id: newId(),
        accountId: r.accountId,
        transferAccountId: null,
        type: r.type,
        amountCents: r.amountCents,
        category: r.category,
        description: r.description,
        date,
        paymentMethod: r.paymentMethod,
        recurringId: r.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }
  return out;
}

export function validateTransaction(t: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'transferAccountId' | 'category' | 'date'>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) errors.amount = 'Informe um valor maior que zero.';
  if (t.amountCents > 100_000_000_00) errors.amount = 'Valor muito alto.';
  if (!t.category && t.type !== 'transfer') errors.category = 'Escolha uma categoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) errors.date = 'Data inválida.';
  if (t.type === 'transfer') {
    if (!t.accountId || !t.transferAccountId) errors.account = 'Escolha as contas de origem e destino.';
    else if (t.accountId === t.transferAccountId) errors.account = 'Origem e destino devem ser diferentes.';
  }
  return errors;
}
