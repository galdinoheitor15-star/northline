// Transcrição de voz. Recebe o áudio, envia ao serviço de transcrição e devolve apenas o texto.
// O áudio não é armazenado. O texto volta ao app, que o envia ao assistente (prévia + confirmação).
import { enforceLimit, requireUser } from '../_shared/auth.ts';
import { HttpError, json, requireEnv, serve } from '../_shared/http.ts';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^audio\/(m4a|mp4|x-m4a|aac|mpeg|mp3|wav|x-wav|webm|ogg|3gpp)|^video\/(mp4|webm)|^application\/octet-stream/;
const DAILY_LIMIT = Number(Deno.env.get('TRANSCRIPTION_DAILY_LIMIT') ?? '60');

serve('transcribe', async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const { user } = await requireUser(req);
  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File)) throw new HttpError(400, 'Envie o áudio no campo "audio".', 'invalid_input');
  if (audio.size === 0) throw new HttpError(400, 'Áudio vazio.', 'invalid_input');
  if (audio.size > MAX_BYTES) throw new HttpError(413, 'Áudio muito longo (máx. 10 MB).', 'too_large');
  if (audio.type && !ALLOWED.test(audio.type)) throw new HttpError(415, 'Formato de áudio não suportado.', 'unsupported');
  await enforceLimit(user.id, 'transcription', DAILY_LIMIT);

  // Serviço compatível com a API de transcrição da OpenAI (OpenAI, Groq, etc.), configurável por variável de ambiente.
  const upstream = new FormData();
  upstream.append('file', audio, audio.name || 'audio.m4a');
  upstream.append('model', Deno.env.get('TRANSCRIPTION_MODEL') ?? 'whisper-1');
  upstream.append('language', 'pt');
  upstream.append('response_format', 'json');
  const res = await fetch(Deno.env.get('TRANSCRIPTION_API_URL') ?? 'https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('TRANSCRIPTION_API_KEY')}` },
    body: upstream,
  });
  if (!res.ok) {
    console.error('[transcribe] upstream status', res.status);
    throw new HttpError(502, res.status === 429 ? 'Serviço de transcrição sobrecarregado. Tente em instantes.' : 'Falha no serviço de transcrição.', 'transcription_failed');
  }
  const body = (await res.json()) as { text?: string };
  return json(req, { text: (body.text ?? '').trim().slice(0, 2000) });
});
