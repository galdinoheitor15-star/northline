import { normalize } from './normalize';

export type Intent =
  | 'query_day'
  | 'query_tasks'
  | 'query_spending'
  | 'query_income'
  | 'query_balance'
  | 'query_free'
  | 'query_habits'
  | 'create_transaction'
  | 'log_workout'
  | 'plan_workout'
  | 'cancel_event'
  | 'update_event'
  | 'log_habit'
  | 'create_task'
  | 'create_event'
  | 'unknown';

export const MONEY_RE = /(?:r\$\s*([\d.]+(?:,\d{1,2})?))|(?:\b([\d.]+(?:,\d{1,2})?)\s*(?:reais|real|conto|contos|pila|pilas)\b)/;
const MONEY_WORDS_RE = /\b((?:(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|dez|quinze|doze|onze|treze|quatorze|cinco|seis|sete|oito|nove|um|uma|dois|duas|tres|quatro)(?:\s+e\s+)?)+)\s+(?:reais|real|contos?)\b/;

export function hasMoney(norm: string): boolean {
  return MONEY_RE.test(norm) || MONEY_WORDS_RE.test(norm);
}

export function classify(text: string): Intent {
  const n = normalize(text).trim();
  const question = /\?\s*$/.test(n) || /^(o que|quais?|quanto|quando|como|tenho algo|estou livre|mostra|me mostra|lista|resumo)\b/.test(n);

  if (/\b(quanto|quanta)\b.*\b(gastei|gasto|gastos|despesas?)\b|\bmeus gastos\b|\bgastos do mes\b/.test(n)) return 'query_spending';
  if (/\bquanto\b.*\b(recebi|ganhei|receitas?|entrou)\b/.test(n)) return 'query_income';
  if (/\b(meu saldo|qual (e )?(o )?(meu )?saldo|quanto (eu )?tenho (de dinheiro|na conta))\b/.test(n)) return 'query_balance';
  if (question && /\b(livre|disponivel|disponibilidade|horario vago|horarios livres)\b/.test(n)) return 'query_free';
  if (question && /\btarefas?\b/.test(n)) return 'query_tasks';
  if (question && /\bhabitos?\b/.test(n)) return 'query_habits';
  if (question && /\b(o que (eu )?tenho|agenda|compromissos?|reunioes?|programado|programacao|meu dia|tenho algo)\b/.test(n)) return 'query_day';

  if (hasMoney(n) && /\b(gastei|paguei|comprei|torrei|gasto|despesa|recebi|ganhei|entrou|receita|caiu|transferi)\b/.test(n)) return 'create_transaction';
  if (/\b(gastei|paguei|comprei)\b/.test(n)) return 'create_transaction';

  if (/\b(registr\w*|anot\w*|salv\w*|log)\b.*\btreino\b|\btreinei\b|\bfiz (o |meu )?treino\b/.test(n)) return 'log_workout';
  if (/\b(quero|vou|preciso|pretendo) treinar\b|\b(marca|agenda|programa)r?\s+(um |meu |o )?treino\b/.test(n)) return 'plan_workout';

  if (/\b(cancela|cancelar|cancele|desmarca|desmarcar|desmarque|apaga|apagar|exclui|excluir|remove|remover)\b/.test(n)) return 'cancel_event';
  if (/\b(muda|mudar|mude|altera|alterar|altere|remarca|remarcar|remarque|adia|adiar|adie|antecipa|antecipar|passa|passar|move|mover|transfere|transferir|troca|trocar)\b/.test(n)) return 'update_event';

  if (/\b(fiz|conclui|completei|terminei|cumpri)\b|\bmarca\b.*\bcomo (feito|concluido)\b|\bhabito\b/.test(n)) return 'log_habit';

  if (/\b(tarefa|lembra de|lembrar de|me lembre|me lembra|adiciona|adicionar|adicione|anota|anotar|anote|tenho que|preciso)\b/.test(n)) return 'create_task';
  if (/\b(marca|marcar|marque|agenda|agendar|agende|reuniao|consulta|compromisso|encontro|aula|call|evento|entrevista|dentista|medico|aniversario|jantar com|almoco com)\b/.test(n)) return 'create_event';
  if (question) return 'query_day';
  return 'unknown';
}

/** Extrai valor em centavos de frases como "35 reais", "R$ 35,90", "trinta e cinco reais". */
export function extractAmountCents(text: string): { cents: number; span: [number, number] } | null {
  const n = normalize(text);
  const m = MONEY_RE.exec(n);
  if (m) {
    const raw = (m[1] ?? m[2]).replace(/\./g, '').replace(',', '.');
    const [int, dec = ''] = raw.split('.');
    const cents = Number(int) * 100 + Number(dec.padEnd(2, '0').slice(0, 2));
    if (Number.isFinite(cents) && cents > 0) return { cents, span: [m.index, m.index + m[0].length] };
  }
  const w = MONEY_WORDS_RE.exec(n);
  if (w) {
    const words: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };
    const total = w[1].split(/\s+e\s+|\s+/).reduce((a, p) => a + (words[p] ?? 0), 0);
    if (total > 0) return { cents: total * 100, span: [w.index, w.index + w[0].length] };
  }
  return null;
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/\b(almoc\w*|jant\w*|lanche|mercado|supermercado|ifood|restaurante|padaria|cafe|comida|pizza|feira|acai|hamburguer)\b/, 'Alimentação'],
  [/\b(uber|99|taxi|gasolina|combustivel|onibus|metro|estacionamento|pedagio|passagem)\b/, 'Transporte'],
  [/\b(farmacia|remedio|medico|consulta|dentista|exame|plano de saude|academia)\b/, 'Saúde'],
  [/\b(aluguel|condominio|iptu)\b/, 'Moradia'],
  [/\b(luz|energia|agua|internet|celular|telefone|gas|conta de)\b/, 'Contas'],
  [/\b(netflix|spotify|assinatura|prime|disney|youtube|icloud)\b/, 'Assinaturas'],
  [/\b(cinema|show|bar|cerveja|festa|viagem|jogo|ingresso)\b/, 'Lazer'],
  [/\b(curso|livro|faculdade|escola|mensalidade|material)\b/, 'Educação'],
  [/\b(roupa|tenis|loja|presente|shopping|amazon)\b/, 'Compras'],
];

export function inferExpenseCategory(text: string): string {
  const n = normalize(text);
  return CATEGORY_KEYWORDS.find(([re]) => re.test(n))?.[1] ?? 'Outros';
}

export function inferIncomeCategory(text: string): string {
  const n = normalize(text);
  if (/\bsalario\b/.test(n)) return 'Salário';
  if (/\b(freela|freelance|projeto|cliente)\b/.test(n)) return 'Freelance';
  if (/\b(rendimento|dividendo|investimento)\b/.test(n)) return 'Investimentos';
  if (/\b(reembolso|devolveram|devolucao)\b/.test(n)) return 'Reembolso';
  return 'Outros';
}
