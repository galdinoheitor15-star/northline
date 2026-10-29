// Conversões de fuso para o backend (mesma regra do app: datas locais -> instantes UTC).
import { TZDate } from 'npm:@date-fns/tz@1.5.0';

export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, tz).getTime());
}

export function localParts(at: Date, tz: string) {
  const z = new TZDate(at.getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return { date: `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`, time: `${pad(z.getHours())}:${pad(z.getMinutes())}`, weekday: weekdays[z.getDay()] };
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
