import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/state/data';
import { toDateKey, toTimeOfDay } from '@/domain/time';

/** Relógio de referência no fuso do usuário, atualizado a cada minuto. */
export function useNow() {
  const tz = useData((s) => s.profile.timezone);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => ({ now, tz, today: toDateKey(now, tz), time: toTimeOfDay(now, tz) }), [now, tz]);
}
