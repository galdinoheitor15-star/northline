import { categoryLabel, draftRange, findConflicts, freeSlots, type EventDraft } from './events';
import { formatBRL, monthRange, periodTotals, totalBalance } from './finance';
import { habitsTodaySummary, isCompletedOn, isScheduledOn, logsByDate } from './habits';
import { classify, extractAmountCents, inferExpenseCategory, inferIncomeCategory } from './nlp/intent';
import { normalize } from './nlp/normalize';
import { cleanTitle, extractDateTime, Extractor, type ParseContext } from './nlp/parse';
import type { AssistantReply, ConflictInfo, PendingRequest, Proposal } from './proposals';
import { expandEvents } from './recurrence';
import { bucketOf, isDone } from './tasks';
import { endOfDayUtc, formatDuration, formatLongDate, relativeDayLabel, startOfDayUtc, toDateKey, toTimeOfDay, zonedToUtc } from './time';
import type { CalendarEvent, EventCategory, FinanceAccount, Habit, HabitLog, Task, Transaction, WorkoutRoutine, WorkoutSession } from './types';
import { nextScheduledWorkout } from './workouts';

export interface LocalContext extends ParseContext {
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  transactions: Transaction[];
  accounts: FinanceAccount[];
  routines: WorkoutRoutine[];
  sessions: WorkoutSession[];
  defaultReminderMinutes: number | null;
  pending?: PendingRequest | null;
  newId: () => string;
}

const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'minha', 'meu', 'minhas', 'meus', 'com', 'para', 'pra', 'na', 'no', 'em', 'e', 'um', 'uma', 'que', 'hoje', 'amanha']);

export function inferCategory(text: string): EventCategory {
  const n = normalize(text);
  if (/\b(reuniao|call|meet|alinhamento|daily|1:1|entrevista)\b/.test(n)) return 'meeting';
  if (/\b(estud\w*|aula|prova|faculdade|curso|revisao|ler|leitura|trabalho de grupo|tcc)\b/.test(n)) return 'study';
  if (/\b(treino|academia|corrida|medico|dentista|consulta|exame|terapia|yoga|pilates|futebol|natacao)\b/.test(n)) return 'health';
  if (/\b(trabalho|cliente|projeto|entrega|relatorio|escritorio|expediente)\b/.test(n)) return 'work';
  return 'personal';
}

const fmtConflicts = (list: ConflictInfo[], tz: string) =>
  list.map((c) => `${c.title} (${toTimeOfDay(new Date(c.startAt), tz)}–${toTimeOfDay(new Date(c.endAt), tz)})`).join(', ');

function conflictsFor(ctx: LocalContext, start: Date, end: Date, ignoreId?: string): ConflictInfo[] {
  return findConflicts(ctx.events, start, end, ignoreId).map((o) => ({ title: o.event.title, startAt: o.start.toISOString(), endAt: o.end.toISOString() }));
}

/** Pergunta de esclarecimento respondida: junta com o pedido original. */
function mergePending(text: string, pending: PendingRequest | null | undefined): string {
  if (!pending) return text;
  const n = normalize(text).trim();
  if (/^(cancela|deixa|esquece|nao|não)\b/.test(n)) return '';
  if (pending.missing === 'time') {
    // remove o período vago ("à tarde") do pedido original e acrescenta o horário informado
    // \b não funciona com letras acentuadas ("à"), então o limite é feito com espaços
    const base = pending.text.replace(/(^|\s)(de|pela|à|a|na)\s+(manhã|manha|tarde|noite)(?=$|[\s,.!?])/i, '$1');
    const t = /^\d{1,2}(\s*(h|:)\s*\d{0,2})?$/.test(n) ? `às ${text.trim()}` : text;
    return `${base} ${t}`;
  }
  return `${pending.text} ${text}`;
}

export function interpretLocally(input: string, ctx: LocalContext): AssistantReply {
  const merged = mergePending(input, ctx.pending);
  if (!merged.trim()) return { reply: 'Tudo bem, deixei para lá.', proposals: [], pending: null, engine: 'local' };
  const intent = classify(merged);
  const today = toDateKey(ctx.now, ctx.tz);
  const reply = (r: string, proposals: Proposal[] = [], pending: PendingRequest | null = null): AssistantReply => ({ reply: r, proposals, pending, engine: 'local' });

  switch (intent) {
    case 'query_day': {
      const ex = new Extractor(merged);
      const info = extractDateTime(ex, ctx);
      const day = info.date ?? today;
      const occ = expandEvents(ctx.events, startOfDayUtc(day, ctx.tz), endOfDayUtc(day, ctx.tz));
      const tasks = ctx.tasks.filter((t) => !isDone(t) && t.dueDate === day);
      const habits = ctx.habits.filter((h) => !h.archivedAt && isScheduledOn(h, day) && h.frequency === 'daily');
      const label = day === today ? 'Hoje' : relativeDayLabel(day, today);
      const lines: string[] = [];
      lines.push(occ.length ? `${label} você tem ${occ.length} compromisso${occ.length > 1 ? 's' : ''}:` : `${label} não há compromissos na agenda.`);
      for (const o of occ) lines.push(`• ${o.event.allDay ? 'Dia inteiro' : toTimeOfDay(o.start, ctx.tz)} — ${o.event.title}`);
      if (tasks.length) lines.push(`Tarefas pendentes: ${tasks.map((t) => t.title).join(', ')}.`);
      if (habits.length && day === today) {
        const s = habitsTodaySummary(ctx.habits, ctx.habitLogs, today);
        lines.push(`Hábitos: ${s.done} de ${s.scheduled} concluídos.`);
      }
      return reply(lines.join('\n'));
    }
    case 'query_tasks': {
      const ex = new Extractor(merged);
      const info = extractDateTime(ex, ctx);
      const n = normalize(merged);
      let list: Task[];
      let title: string;
      if (/atrasad/.test(n)) {
        list = ctx.tasks.filter((t) => bucketOf(t, today) === 'overdue');
        title = 'Tarefas atrasadas';
      } else if (/conclu|feitas/.test(n)) {
        list = ctx.tasks.filter((t) => isDone(t) && t.completedAt && toDateKey(new Date(t.completedAt), ctx.tz) === (info.date ?? today));
        title = 'Concluídas';
      } else {
        const day = info.date ?? today;
        list = ctx.tasks.filter((t) => !isDone(t) && (t.dueDate === day || (day === today && t.dueDate != null && t.dueDate < today)));
        title = day === today ? 'Tarefas de hoje (incluindo atrasadas)' : `Tarefas de ${relativeDayLabel(day, today)}`;
      }
      if (!list.length) return reply(`${title}: nenhuma. 🎯`.replace(' 🎯', ''));
      return reply([`${title}:`, ...list.map((t) => `• ${t.title}${t.dueTime ? ` às ${t.dueTime}` : ''}${t.dueDate && t.dueDate < today ? ' (atrasada)' : ''}`)].join('\n'));
    }
    case 'query_spending':
    case 'query_income': {
      const n = normalize(merged);
      let from = monthRange(today).from;
      let to = today;
      let label = 'neste mês';
      if (/mes passado/.test(n)) {
        const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
        const k = d.toISOString().slice(0, 10);
        ({ from, to } = monthRange(k));
        label = 'no mês passado';
      } else if (/\bhoje\b/.test(n)) {
        from = today;
        label = 'hoje';
      } else if (/semana/.test(n)) {
        from = toDateKey(new Date(ctx.now.getTime() - 6 * 86_400_000), ctx.tz);
        label = 'nos últimos 7 dias';
      }
      const t = periodTotals(ctx.transactions, from, to);
      if (intent === 'query_income') return reply(`Você recebeu ${formatBRL(t.income)} ${label}.`);
      if (!t.count) return reply(`Não há despesas registradas ${label}.`);
      return reply(`Você gastou ${formatBRL(t.expense)} ${label}, em ${ctx.transactions.filter((x) => x.type === 'expense' && x.date >= from && x.date <= to).length} lançamento(s). Receitas: ${formatBRL(t.income)}.`);
    }
    case 'query_balance': {
      if (!ctx.accounts.length && !ctx.transactions.length) return reply('Ainda não há contas ou lançamentos registrados.');
      return reply(`Saldo calculado a partir dos seus lançamentos: ${formatBRL(totalBalance(ctx.accounts, ctx.transactions))}.`);
    }
    case 'query_free': {
      const ex = new Extractor(merged);
      const info = extractDateTime(ex, ctx);
      const day = info.date ?? today;
      const from = day === today ? new Date(Math.max(ctx.now.getTime(), zonedToUtc(day, '08:00', ctx.tz).getTime())) : zonedToUtc(day, '08:00', ctx.tz);
      const to = zonedToUtc(day, '22:00', ctx.tz);
      if (from >= to) return reply('O dia já está quase no fim.');
      const occ = expandEvents(ctx.events, from, to);
      const slots = freeSlots(occ, from, to, 30);
      if (!slots.length) return reply(`${relativeDayLabel(day, today)} não há horários livres entre 8h e 22h.`);
      return reply(`Horários livres ${relativeDayLabel(day, today).toLowerCase()}:\n${slots.map((s) => `• ${toTimeOfDay(s.start, ctx.tz)}–${toTimeOfDay(s.end, ctx.tz)}`).join('\n')}`);
    }
    case 'query_habits': {
      const s = habitsTodaySummary(ctx.habits, ctx.habitLogs, today);
      if (!s.scheduled) return reply('Nenhum hábito programado para hoje.');
      const pending = ctx.habits.filter((h) => !h.archivedAt && h.frequency === 'daily' && isScheduledOn(h, today) && !isCompletedOn(h, logsByDate(ctx.habitLogs, h.id), today));
      return reply(`Hábitos de hoje: ${s.done}/${s.scheduled} concluídos.${pending.length ? ` Faltam: ${pending.map((h) => h.name).join(', ')}.` : ''}`);
    }
    case 'create_transaction': {
      const amount = extractAmountCents(merged);
      if (!amount) return reply('Qual foi o valor?', [], { text: merged, missing: 'amount' });
      const n = normalize(merged);
      const type: 'income' | 'expense' = /\b(recebi|ganhei|entrou|receita|caiu)\b/.test(n) ? 'income' : 'expense';
      const ex = new Extractor(merged);
      ex.consume(amount.span[0], amount.span[1]);
      const info = extractDateTime(ex, ctx);
      const rest = cleanTitle(ex.remainder().replace(/\b(que |eu )?(gastei|paguei|comprei|recebi|ganhei|entrou|anota|anotar|registra|registrar)\b/gi, ' ').replace(/^\s*(com|no|na|em|de)\s+/i, ''));
      const category = type === 'income' ? inferIncomeCategory(merged) : inferExpenseCategory(merged);
      const date = info.date && info.date <= today ? info.date : today;
      const account = ctx.accounts.find((a) => !a.archivedAt) ?? null;
      const p: Proposal = {
        id: ctx.newId(),
        kind: 'create_transaction',
        summary: `${type === 'income' ? 'Receita' : 'Despesa'} de ${formatBRL(amount.cents)} · ${category}`,
        warnings: account ? [] : ['Nenhuma conta cadastrada: o lançamento ficará sem conta.'],
        tx: { type, amountCents: amount.cents, category, description: rest || null, date, accountId: account?.id ?? null },
      };
      return reply(`Confira o lançamento antes de salvar:`, [p]);
    }
    case 'log_workout': {
      const n = normalize(merged);
      const routine = ctx.routines.find((r) => n.includes(normalize(r.name))) ?? nextScheduledWorkout(ctx.routines, ctx.sessions, ctx.now, ctx.tz)?.routine ?? null;
      const p: Proposal = {
        id: ctx.newId(),
        kind: 'log_workout',
        summary: routine ? `Registrar treino "${routine.name}"` : 'Registrar treino livre',
        warnings: [],
        routineId: routine?.id ?? null,
        name: routine?.name ?? 'Treino livre',
      };
      return reply('Vou abrir o registro de treino para você preencher séries e cargas.', [p]);
    }
    case 'plan_workout': {
      const ex = new Extractor(merged);
      const info = extractDateTime(ex, ctx);
      const date = info.date ?? today;
      const n = normalize(merged);
      const routine = ctx.routines.find((r) => n.includes(normalize(r.name))) ?? ctx.routines[0] ?? null;
      const existing = expandEvents(ctx.events, startOfDayUtc(date, ctx.tz), endOfDayUtc(date, ctx.tz)).filter((o) => o.event.category === 'health');
      if (existing.length) return reply(`Você já tem ${existing.map((o) => `"${o.event.title}" às ${toTimeOfDay(o.start, ctx.tz)}`).join(', ')} em ${formatLongDate(date)}.`);
      if (!info.time) return reply(`Que horas você quer treinar em ${formatLongDate(date)}?`, [], { text: merged, missing: 'time' });
      return createEventReply(`Treino${routine ? `: ${routine.name}` : ''}`, info, 'health', ctx, reply);
    }
    case 'cancel_event':
    case 'update_event':
      return modifyEvent(merged, intent, ctx, reply);
    case 'log_habit': {
      const n = normalize(merged);
      const habit = ctx.habits.filter((h) => !h.archivedAt).find((h) => n.includes(normalize(h.name)) || normalize(h.name).split(/\s+/).some((w) => w.length > 3 && n.includes(w)));
      if (!habit) {
        if (/\bhabito\b/.test(n)) return reply(ctx.habits.length ? `Qual hábito? Você tem: ${ctx.habits.filter((h) => !h.archivedAt).map((h) => h.name).join(', ')}.` : 'Você ainda não tem hábitos cadastrados.');
        return createTaskOrEvent(merged, ctx, reply);
      }
      const ex = new Extractor(merged);
      const info = extractDateTime(ex, ctx);
      const date = info.date && info.date <= today ? info.date : today;
      return reply('Confirma o registro do hábito?', [{ id: ctx.newId(), kind: 'log_habit', summary: `${habit.name} · ${relativeDayLabel(date, today)}`, warnings: [], habitId: habit.id, habitName: habit.name, date }]);
    }
    case 'create_task':
    case 'create_event':
      return createTaskOrEvent(merged, ctx, reply);
    default:
      return reply('Não entendi. Você pode pedir, por exemplo: "Marca uma reunião amanhã às 15h", "Anota que gastei 35 reais" ou "O que tenho para hoje?".');
  }
}

type ReplyFn = (r: string, p?: Proposal[], pending?: PendingRequest | null) => AssistantReply;

function createTaskOrEvent(text: string, ctx: LocalContext, reply: ReplyFn): AssistantReply {
  const intent = classify(text);
  const ex = new Extractor(text);
  const info = extractDateTime(ex, ctx);
  const title = cleanTitle(ex.remainder());
  if (!title) return reply('Qual é o título?', [], { text, missing: 'target' });
  const category = inferCategory(text);
  const today = toDateKey(ctx.now, ctx.tz);

  if (intent === 'create_task') {
    const p: Proposal = {
      id: ctx.newId(),
      kind: 'create_task',
      summary: `Tarefa: ${title}`,
      warnings: info.warnings,
      task: { title, dueDate: info.date ?? (info.time ? today : null), dueTime: info.time ?? null, priority: 'medium', category, reminderMinutes: info.time ? ctx.defaultReminderMinutes : null },
    };
    const when = p.task.dueDate ? ` para ${formatLongDate(p.task.dueDate)}${p.task.dueTime ? ` às ${p.task.dueTime}` : ''}` : '';
    return reply(`Criar a tarefa "${title}"${when}? Você também pode salvar como compromisso.`, [p]);
  }

  if (!info.time && !info.recurrence && info.partOfDay) {
    const label = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' }[info.partOfDay];
    return reply(`Qual horário ${label}${info.date ? ` em ${formatLongDate(info.date)}` : ''}?`, [], { text, missing: 'time' });
  }
  if (!info.time) {
    return reply(`Qual horário para "${title}"${info.date ? ` em ${formatLongDate(info.date)}` : ''}?`, [], { text, missing: 'time' });
  }
  return createEventReply(title, info, category, ctx, reply);
}

function createEventReply(title: string, info: ReturnType<typeof extractDateTime>, category: EventCategory, ctx: LocalContext, reply: ReplyFn): AssistantReply {
  const draft: EventDraft = {
    title,
    date: info.date!,
    startTime: info.time!,
    endTime: info.endTime ?? null,
    durationMinutes: info.endTime ? null : info.durationMinutes ?? 60,
    timezone: ctx.tz,
    category,
    reminderMinutes: ctx.defaultReminderMinutes,
    recurrence: info.recurrence ?? null,
  };
  const { start, end } = draftRange(draft);
  const conflicts = conflictsFor(ctx, start, end);
  const warnings = [...info.warnings];
  if (start < ctx.now) warnings.push('Esse horário já passou.');
  if (conflicts.length) warnings.push(`Conflito com: ${fmtConflicts(conflicts, ctx.tz)}.`);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const p: Proposal = {
    id: ctx.newId(),
    kind: 'create_event',
    summary: `${title} · ${formatLongDate(draft.date)}, ${draft.startTime}–${toTimeOfDay(end, ctx.tz)} (${formatDuration(minutes)}) · ${categoryLabel(category)}`,
    warnings,
    draft,
    conflicts,
  };
  return reply(conflicts.length ? 'Atenção: há conflito de horário. Deseja salvar mesmo assim?' : 'Confira o compromisso antes de salvar:', [p]);
}

function modifyEvent(text: string, intent: 'cancel_event' | 'update_event', ctx: LocalContext, reply: ReplyFn): AssistantReply {
  // Em "muda X de amanhã para as 16h", o que vem antes de "para" identifica o evento
  const n = normalize(text);
  const splitAt = intent === 'update_event' ? n.search(/\s(para|pra|pras)\s/) : -1;
  const targetText = splitAt > 0 ? text.slice(0, splitAt) : text;
  const changeText = splitAt > 0 ? text.slice(splitAt) : '';

  const tEx = new Extractor(targetText);
  const tInfo = extractDateTime(tEx, ctx);
  const words = normalize(tEx.remainder())
    .replace(/\b(cancela\w*|desmarca\w*|apaga\w*|exclui\w*|remove\w*|muda\w*|altera\w*|remarca\w*|adia\w*|antecipa\w*|passa\w*|move\w*|transfere\w*|troca\w*|evento|compromisso)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));

  const from = tInfo.date ? startOfDayUtc(tInfo.date, ctx.tz) : ctx.now;
  const to = tInfo.date ? endOfDayUtc(tInfo.date, ctx.tz) : new Date(ctx.now.getTime() + 30 * 86_400_000);
  const candidates = expandEvents(ctx.events, from, to).filter((o) => o.end >= ctx.now || tInfo.date);
  const scored = candidates
    .map((o) => ({ o, score: words.filter((w) => normalize(o.event.title).includes(w) || normalize(categoryLabel(o.event.category)).includes(w) || (w.startsWith('reuni') && o.event.category === 'meeting')).length }))
    .filter((x) => x.score > 0 || (!words.length && tInfo.date))
    .sort((a, b) => b.score - a.score || a.o.start.getTime() - b.o.start.getTime());

  if (!scored.length) return reply('Não encontrei esse compromisso nos próximos dias. Pode dizer o nome ou a data?');
  const top = scored.filter((s) => s.score === scored[0].score);
  if (top.length > 1 && !tInfo.date) {
    return reply(
      `Encontrei ${top.length} compromissos parecidos. Qual deles?\n${top
        .slice(0, 5)
        .map((s) => `• ${s.o.event.title} — ${formatLongDate(toDateKey(s.o.start, ctx.tz))} às ${toTimeOfDay(s.o.start, ctx.tz)}`)
        .join('\n')}`,
    );
  }
  const occ = top[0].o;
  const occurrenceStart = occ.event.recurrence ? occ.start.toISOString() : null;

  if (intent === 'cancel_event') {
    return reply(occ.event.recurrence ? 'É uma série recorrente: vou cancelar só esta ocorrência.' : 'Confirma o cancelamento?', [
      {
        id: ctx.newId(),
        kind: 'cancel_event',
        summary: `Cancelar "${occ.event.title}" · ${formatLongDate(toDateKey(occ.start, ctx.tz))} às ${toTimeOfDay(occ.start, ctx.tz)}`,
        warnings: occ.event.externalId ? ['O evento também será cancelado no Google Calendar na próxima sincronização.'] : [],
        eventId: occ.event.id,
        occurrenceStart,
        title: occ.event.title,
        startAt: occ.start.toISOString(),
      },
    ]);
  }

  const cEx = new Extractor(changeText || text);
  const cInfo = extractDateTime(cEx, { ...ctx });
  const n2 = normalize(changeText);
  const explicitDate = /\b(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d|\d{1,2}\/\d{1,2}|daqui)\b/.test(n2);
  if (!cInfo.time && !explicitDate && !cInfo.durationMinutes) return reply(`Para quando devo mudar "${occ.event.title}"?`);
  const duration = cInfo.durationMinutes ?? Math.round((occ.end.getTime() - occ.start.getTime()) / 60_000);
  const dateKey = explicitDate && cInfo.date ? cInfo.date : toDateKey(occ.start, ctx.tz);
  const time = cInfo.time ?? toTimeOfDay(occ.start, ctx.tz);
  const start = zonedToUtc(dateKey, time, ctx.tz);
  const end = new Date(start.getTime() + duration * 60_000);
  const conflicts = conflictsFor(ctx, start, end, occ.event.id);
  const warnings = cInfo.warnings.filter((w) => !w.startsWith('Como esse horário'));
  if (conflicts.length) warnings.push(`Conflito com: ${fmtConflicts(conflicts, ctx.tz)}.`);
  if (occ.event.recurrence) warnings.push('Só esta ocorrência da série será alterada.');
  return reply('Confira a alteração:', [
    {
      id: ctx.newId(),
      kind: 'update_event',
      summary: `"${occ.event.title}": ${toTimeOfDay(occ.start, ctx.tz)} → ${formatLongDate(dateKey)} às ${time}`,
      warnings,
      eventId: occ.event.id,
      occurrenceStart,
      before: { title: occ.event.title, startAt: occ.start.toISOString(), endAt: occ.end.toISOString() },
      after: { title: occ.event.title, startAt: start.toISOString(), endAt: end.toISOString() },
      conflicts,
    },
  ]);
}
