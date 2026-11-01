import type { Request, Response } from 'express';

// Prototype : appelle un Space Gradio LocateAnything (NVIDIA, licence non commerciale : recherche et usage associatif).
// LOCATE_URL (défaut : le Space public de NVIDIA), LOCATE_HF_TOKEN (optionnel : quota de votre compte Hugging Face), LOCATE_MOCK=1 (réponse fictive pour tester l'interface).
const BASE = () => (process.env.LOCATE_URL || 'https://nvidia-locateanything.hf.space').replace(/\/$/, '') + '/gradio_api';
const auth = (): Record<string, string> => (process.env.LOCATE_HF_TOKEN ? { Authorization: `Bearer ${process.env.LOCATE_HF_TOKEN}` } : {});

/** Dernier événement d'un flux SSE Gradio → sa donnée JSON. */
export function parseSse(text: string): { event: string; data: unknown } {
  let event = ''; let data = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  return { event, data: data ? JSON.parse(data) : null };
}

const MOCK = [
  { label: 'person', type: 'box', coords: [180, 120, 420, 980] },
  { label: 'face', type: 'box', coords: [250, 140, 350, 300] },
  { label: 'person', type: 'box', coords: [640, 300, 820, 990] },
];

export default async function locateHandler(req: Request, res: Response) {
  const { image, categories } = req.body ?? {};
  const m = typeof image === 'string' ? /^data:image\/(jpeg|png);base64,(.+)$/.exec(image) : null;
  if (!m) return res.status(400).json({ error: 'Image manquante (JPEG ou PNG en base64)' });
  if (process.env.LOCATE_MOCK) return res.json({ detections: MOCK });
  try {
    const form = new FormData();
    form.append('files', new Blob([Buffer.from(m[2], 'base64')], { type: `image/${m[1]}` }), `cadre.${m[1] === 'png' ? 'png' : 'jpg'}`);
    const up = await fetch(`${BASE()}/upload`, { method: 'POST', headers: auth(), body: form });
    if (!up.ok) throw new Error(`Envoi de l'image refusé (${up.status})`);
    const [path] = (await up.json()) as string[];
    const cat = typeof categories === 'string' && categories.trim() ? categories : 'person, face';
    const call = await fetch(`${BASE()}/call/run_inference`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ data: ['Image', { path, meta: { _type: 'gradio.FileData' } }, null, 'Detection', cat, 'hybrid', 0.7, 0.9, 20, null, null, 4] }),
    });
    if (!call.ok) throw new Error(`Appel refusé (${call.status})`);
    const { event_id } = (await call.json()) as { event_id: string };
    const sse = parseSse(await (await fetch(`${BASE()}/call/run_inference/${event_id}`, { headers: auth() })).text());
    const meta = Array.isArray(sse.data) ? (sse.data[2] as { success?: boolean; error?: string; detections?: unknown[] }) : null;
    if (sse.event !== 'complete' || !meta?.success) throw new Error(meta?.error || String(sse.data) || 'Analyse impossible');
    res.json({ detections: meta.detections ?? [] });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
