import { describe, expect, it } from 'vitest';
import { cleanTitle, extractDateTime, Extractor } from '@/domain/nlp/parse';
import { classify, extractAmountCents } from '@/domain/nlp/intent';
import { zonedToUtc } from '@/domain/time';

const tz = 'America/Recife';
// Quinta-feira, 29/10/2026, 10:00 em Recife
const now = zonedToUtc('2026-10-29', '10:00', tz);
const ctx = { now, tz };

function parse(text: string) {
  const ex = new Extractor(text);
  const info = extractDateTime(ex, ctx);
  return { ...info, title: cleanTitle(ex.remainder()) };
}

describe('datas relativas em pt-BR', () => {
  it('hoje, amanhã e depois de amanhã', () => {
    expect(parse('reunião hoje às 15h').date).toBe('2026-10-29');
    expect(parse('reunião amanhã às 15h').date).toBe('2026-10-30');
    expect(parse('dentista depois de amanhã às 9h').date).toBe('2026-10-31');
  });

  it('dias da semana e "próxima"', () => {
    expect(parse('reunião na sexta às 14h').date).toBe('2026-10-30');
    expect(parse('aula na próxima segunda-feira às 8h').date).toBe('2026-11-02');
    expect(parse('almoço na quinta que vem ao meio-dia').date).toBe('2026-11-05');
    expect(parse('almoço quinta ao meio dia').date).toBe('2026-10-29');
  });

  it('daqui a duas horas / em 30 minutos', () => {
    const a = parse('ligar para o banco daqui a duas horas');
    expect(a.date).toBe('2026-10-29');
    expect(a.time).toBe('12:00');
    const b = parse('call em 30 minutos');
    expect(b.time).toBe('10:30');
  });

  it('fim do mês e datas explícitas', () => {
    expect(parse('pagar fatura no fim do mês').date).toBe('2026-10-31');
    expect(parse('prova dia 15').date).toBe('2026-11-15');
    expect(parse('viagem 20/12').date).toBe('2026-12-20');
    expect(parse('show 5 de março').date).toBe('2027-03-05');
    expect(parse('consulta dia 30 de outubro às 10h').date).toBe('2026-10-30');
  });

  it('recorrência semanal: "toda terça-feira"', () => {
    const r = parse('inglês toda terça-feira às 19h');
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [2] });
    expect(r.date).toBe('2026-11-03');
    expect(r.time).toBe('19:00');
    expect(r.title).toBe('Inglês');
    expect(parse('academia toda segunda, quarta e sexta às 7h').recurrence?.byWeekday).toEqual([1, 3, 5]);
    expect(parse('meditar todos os dias às 6h30').recurrence?.freq).toBe('daily');
  });
});

describe('horários e duração', () => {
  it('formatos de hora', () => {
    expect(parse('reunião amanhã às 15h').time).toBe('15:00');
    expect(parse('reunião amanhã 15h30').time).toBe('15:30');
    expect(parse('reunião amanhã às 15:45').time).toBe('15:45');
    expect(parse('jantar amanhã às 8 da noite').time).toBe('20:00');
    expect(parse('café amanhã às 9 da manhã').time).toBe('09:00');
    expect(parse('almoço amanhã ao meio-dia').time).toBe('12:00');
    expect(parse('reunião amanhã às três da tarde').time).toBe('15:00');
  });

  it('hora ambígua sem período vira tarde, com aviso', () => {
    const r = parse('reunião amanhã às 3');
    expect(r.time).toBe('15:00');
    expect(r.warnings.length).toBe(1);
  });

  it('período sem horário fica pendente', () => {
    const r = parse('marca uma reunião amanhã à tarde');
    expect(r.time).toBeUndefined();
    expect(r.partOfDay).toBe('tarde');
    expect(r.date).toBe('2026-10-30');
  });

  it('duração e intervalo', () => {
    const r = parse('Tenho uma reunião com a equipe na sexta às 14h, com duração de uma hora.');
    expect(r).toMatchObject({ date: '2026-10-30', time: '14:00', durationMinutes: 60, title: 'Reunião com a equipe' });
    expect(parse('workshop amanhã das 14h às 16h30').durationMinutes).toBe(150);
    expect(parse('estudar amanhã às 19h por 2 horas').durationMinutes).toBe(120);
    expect(parse('call amanhã às 10h de 30 minutos').durationMinutes).toBe(30);
    expect(parse('treino amanhã às 7h durante uma hora e meia').durationMinutes).toBe(90);
  });

  it('hora sem data: hoje se ainda não passou, senão amanhã', () => {
    expect(parse('estudar matemática às 19h').date).toBe('2026-10-29');
    const r = parse('café às 8h');
    expect(r.date).toBe('2026-10-30');
  });
});

describe('títulos', () => {
  it('remove verbos de comando, artigos e expressões de data', () => {
    expect(parse('Marca uma reunião amanhã às 15h').title).toBe('Reunião');
    expect(parse('Adiciona estudar matemática às 19h').title).toBe('Estudar matemática');
    expect(parse('me lembra de pagar o aluguel dia 5').title).toBe('Pagar o aluguel');
  });
});

describe('intenções', () => {
  it.each([
    ['Marca uma reunião amanhã às 15h.', 'create_event'],
    ['Adiciona estudar matemática às 19h.', 'create_task'],
    ['Registra meu treino de hoje.', 'log_workout'],
    ['Anota que gastei 35 reais.', 'create_transaction'],
    ['Quais são minhas tarefas de hoje?', 'query_tasks'],
    ['O que tenho para hoje?', 'query_day'],
    ['Muda minha reunião para as 16h.', 'update_event'],
    ['Quanto gastei este mês?', 'query_spending'],
    ['Quero treinar amanhã.', 'plan_workout'],
    ['Cancela a reunião de amanhã', 'cancel_event'],
    ['Estou livre sexta à tarde?', 'query_free'],
  ])('%s → %s', (text, intent) => {
    expect(classify(text)).toBe(intent);
  });

  it('valores monetários em centavos', () => {
    expect(extractAmountCents('gastei 35 reais')?.cents).toBe(3500);
    expect(extractAmountCents('paguei R$ 1.234,56 no aluguel')?.cents).toBe(123456);
    expect(extractAmountCents('gastei 12,9 reais')?.cents).toBe(1290);
    expect(extractAmountCents('gastei trinta e cinco reais')?.cents).toBe(3500);
    expect(extractAmountCents('sem valor')).toBeNull();
  });
});
