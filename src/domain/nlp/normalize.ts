// Normalização que preserva o comprimento do texto, para que os índices encontrados
// no texto normalizado possam ser usados para recortar o texto original.

const MAP: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', ê: 'e', è: 'e', ë: 'e',
  í: 'i', î: 'i', ì: 'i', ï: 'i',
  ó: 'o', ô: 'o', õ: 'o', ò: 'o', ö: 'o',
  ú: 'u', û: 'u', ù: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

export function normalize(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const mapped = MAP[ch] ?? ch;
    // caracteres fora do BMP (emoji) ocupam 2 posições: preserva o comprimento
    out += mapped.length === ch.length ? mapped : ch;
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100,
};

export const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|');

/** "35", "trinta e cinco", "duas" -> número */
export function wordToNumber(s: string): number | null {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(/\s+e\s+/);
  let total = 0;
  for (const p of parts) {
    const v = NUMBER_WORDS[p.trim()];
    if (v === undefined) return null;
    total += v;
  }
  return total;
}
