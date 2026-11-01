// Client minimal pour l'API Albert (DINUM), compatible OpenAI (chat/completions, embeddings).

// Variables lues à l'appel : server.ts charge .env.local après l'import des modules.
const getBaseUrl    = () => process.env.ALBERT_BASE_URL || 'https://albert.api.etalab.gouv.fr/v1';
const getChatModel  = () => process.env.ALBERT_MODEL || 'mistral-small-3-2-24b-instruct-2506';
const getEmbedModel = () => process.env.ALBERT_EMBED_MODEL || 'bge-m3';
export const getVisionModel = () => process.env.ALBERT_VISION_MODEL || 'mistral-small-3-2-24b-instruct-2506';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

export class AlbertError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function getAlbertApiKey(): string {
  const apiKey = process.env.ALBERT_API_KEY;
  if (!apiKey) throw new AlbertError('ALBERT_API_KEY is not configured');
  return apiKey;
}

async function albertFetch(endpoint: string, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAlbertApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new AlbertError(err?.message || "Impossible de joindre l'API Albert", 502);
  }

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AlbertError(`Réponse Albert invalide : ${text.slice(0, 200)}`, 502);
  }

  if (!response.ok) {
    const detail = data?.detail;
    const message = data?.error?.message
      || (typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null)
      || 'Albert request failed';
    throw new AlbertError(message, response.status);
  }

  return data;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<string> {
  const data = await albertFetch('/chat/completions', {
    model: options.model ?? getChatModel(),
    messages,
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    const reason = data.choices?.[0]?.finish_reason;
    throw new AlbertError(`Albert a renvoyé une réponse vide${reason ? ` (${reason})` : ''}.`, 502);
  }
  return reply.trim();
}

export async function embed(input: string[]): Promise<number[][]> {
  const data = await albertFetch('/embeddings', { model: getEmbedModel(), input }) as {
    data: { index: number; embedding: number[] }[];
  };
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

/** Transcription Whisper d'un WAV ; renvoie le texte et, si disponibles, les segments horodatés. */
export async function transcribe(wav: Buffer): Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> {
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'fr');
  form.append('response_format', 'verbose_json');
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${getAlbertApiKey()}` }, body: form });
  } catch (err: any) {
    throw new AlbertError(err?.message || "Impossible de joindre l'API Albert", 502);
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new AlbertError(data?.detail ? JSON.stringify(data.detail) : 'Transcription refusée', response.status);
  const segments = Array.isArray(data.segments) ? data.segments.map((s: any) => ({ start: +s.start || 0, end: +s.end || 0, text: String(s.text ?? '').trim() })) : [];
  return { text: String(data.text ?? '').trim(), segments };
}

export function sendAlbertError(res: any, err: unknown) {
  const status = err instanceof AlbertError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Albert request failed';
  return res.status(status).json({ error: message });
}
