import type { Request, Response } from 'express';
import { AlbertError, chatCompletion, getVisionModel, type ContentPart } from './_albert.js';

export const FIELDS = ['echelle', 'angle', 'mouvement', 'composition', 'lumiere', 'couleurs', 'decor', 'description'] as const;

const SYSTEM = `Tu es analyste de cinéma et de mise en scène. On te donne 1 à 3 images successives d'UN SEUL plan d'un film (début, milieu, fin), et parfois les boîtes de détection de personnages (coordonnées 0-1000) du plan.
Décris ce que tu VOIS, sans interpréter ni inventer. Réponds UNIQUEMENT avec un objet JSON valide :
{"echelle": "PG|PE|PA|PM|PR|GP + précision", "angle": "plongée / contre-plongée / niveau des yeux / cadre penché",
 "mouvement": "fixe, panoramique, travelling, caméra portée, zoom : déduit en comparant les images, « indéterminé » si une seule image",
 "composition": "cadre, placement des personnages, premier plan / second plan / arrière-plan, champ et hors-champ visible",
 "lumiere": "source, qualité (dure/douce), contraste, clair-obscur, naturelle/artificielle", "couleurs": "dominantes et palette",
 "decor": "lieu, éléments de décor et costumes visibles, indices sociaux ou psychologiques",
 "description": "l'action du plan en une ou deux phrases au présent"}
Chaque valeur est une chaîne courte en français. Écris « non observable » plutôt que de deviner.`;

export function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new AlbertError('Réponse IA sans JSON', 502);
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new AlbertError('JSON IA invalide', 502); }
}

export const cleanPlan = (raw: Record<string, unknown>) =>
  Object.fromEntries(FIELDS.map((k) => [k, typeof raw[k] === 'string' ? (raw[k] as string).trim() : '']));

export default async function planHandler(req: Request, res: Response) {
  const { images, detections } = req.body ?? {};
  const ok = Array.isArray(images) && images.length > 0 && images.length <= 3 && images.every((i) => typeof i === 'string' && /^data:image\/jpeg;base64,/.test(i));
  if (!ok) return res.status(400).json({ error: 'Images manquantes (1 à 3 JPEG en base64)' });
  const parts: ContentPart[] = [
    { type: 'text', text: `Détections (LocateAnything) : ${JSON.stringify(detections ?? []).slice(0, 1500)}` },
    ...images.map((url: string): ContentPart => ({ type: 'image_url', image_url: { url } })),
  ];
  try {
    const reply = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: parts }], { maxTokens: 900, temperature: 0.2, model: getVisionModel() });
    res.json(cleanPlan(extractJson(reply)));
  } catch (err) {
    const e = err as AlbertError;
    res.status(e.status ?? 500).json({ error: e.message });
  }
}
