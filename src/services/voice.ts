import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { isSupabaseConfigured } from '@/lib/env';
import { callFunction, FunctionError } from '@/lib/supabase';
import { useSession } from '@/state/session';

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

const MAX_SECONDS = 60;

/** Reconhecimento de fala do navegador (Chrome/Edge). Usado só na web quando não há backend. */
type BrowserRecognition = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
function browserRecognitionCtor(): (new () => BrowserRecognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => BrowserRecognition) | null;
}

export function voiceAvailability(): { ok: boolean; engine: 'server' | 'browser' | null; reason?: string } {
  const serverReady = isSupabaseConfigured && useSession.getState().mode === 'supabase';
  if (serverReady) return { ok: true, engine: 'server' };
  if (browserRecognitionCtor()) return { ok: true, engine: 'browser' };
  return { ok: false, engine: null, reason: 'A transcrição de voz precisa de uma conta conectada ao backend (Supabase + serviço de transcrição).' };
}

/**
 * Grava áudio, mostra estado e devolve a transcrição. A transcrição NUNCA vira ação direto:
 * ela é enviada ao assistente, que devolve uma prévia para confirmação.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const cancelled = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => clearTimer(), []);

  const fail = (msg: string) => {
    clearTimer();
    setError(msg);
    setState('error');
  };

  // o intervalo chama sempre a versão mais recente de stop() (para o limite de duração)
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const elapsed = useRef(0);
  const startTimer = () => {
    elapsed.current = 0;
    setSeconds(0);
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= MAX_SECONDS) void stopRef.current();
    }, 1000);
  };

  async function stop() {
    clearTimer();
    if (recognition.current) {
      recognition.current.stop();
      recognition.current = null;
      return;
    }
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (cancelled.current) return setState('idle');
      const uri = recorder.uri;
      if (!uri) return fail('A gravação ficou vazia.');
      setState('transcribing');
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        form.append('audio', blob, 'gravacao.webm');
      } else {
        form.append('audio', { uri, name: 'gravacao.m4a', type: 'audio/m4a' } as unknown as Blob);
      }
      form.append('language', 'pt');
      const res = await callFunction<{ text: string }>('transcribe', null, { formData: form, timeoutMs: 60_000 });
      setState('idle');
      if (!res.text?.trim()) return fail('Não consegui entender o áudio. Tente falar mais perto do microfone.');
      onTranscript(res.text.trim());
    } catch (e) {
      fail(e instanceof FunctionError ? e.message : `Falha na transcrição: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    stopRef.current = stop;
  });

  async function start() {
    setError(null);
    cancelled.current = false;
    const avail = voiceAvailability();
    if (!avail.ok) return fail(avail.reason!);

    if (avail.engine === 'browser') {
      const Ctor = browserRecognitionCtor()!;
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        setState('idle');
        clearTimer();
        if (text && !cancelled.current) onTranscript(text);
      };
      rec.onerror = (e) => fail(e.error === 'not-allowed' ? 'Permissão de microfone negada no navegador.' : e.error === 'no-speech' ? 'Não ouvi nada. Tente de novo.' : `Erro no reconhecimento de voz (${e.error}).`);
      rec.onend = () => {
        clearTimer();
        setState((s) => (s === 'recording' ? 'idle' : s));
      };
      recognition.current = rec;
      startTimer();
      setState('recording');
      rec.start();
      return;
    }

    setState('requesting');
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return fail('Permissão de microfone negada. Ative nas configurações do aparelho.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTimer();
      setState('recording');
    } catch (e) {
      fail(`Não foi possível iniciar a gravação: ${(e as Error).message}`);
    }
  }

  async function cancel() {
    cancelled.current = true;
    clearTimer();
    if (recognition.current) {
      recognition.current.abort();
      recognition.current = null;
    } else if (state === 'recording') {
      await recorder.stop().catch(() => {});
    }
    setState('idle');
  }

  return {
    state,
    error,
    seconds,
    maxSeconds: MAX_SECONDS,
    start,
    stop,
    cancel,
    reset: () => {
      setError(null);
      setState('idle');
    },
  };
}
