import type { Request, Response } from 'express';
import { AlbertError, chatCompletion } from './_albert.js';

const SYSTEM = `Tu es un analyste de cinéma et de mise en scène (niveau cinéma-audiovisuel, lycée à université). On te donne les données OBSERVÉES d'un extrait de film : fiche saisie par l'utilisateur, découpage en plans (échelle, angle, mouvement, composition, lumière, couleurs, décor, action), transcription des dialogues. Rédige une analyse filmique très fine, en français, selon le modèle Quoi ? Comment ? Pourquoi ?

Structure Markdown imposée :
# Analyse de séquence — <titre>
## 1. Identification et contexte
Fiche technique (titre, réalisateur, date, pays, acteurs), contexte (époque, mouvement, style du cinéaste), statut (genre, adaptation ou création). N'utilise que la fiche et ce que tu sais avec certitude du film ; marque « (à vérifier) » tout élément incertain ; n'invente jamais.
## 2. Quoi ? — La narration (dénotation)
Le récit (structure, chronologie, ellipses, points de vue, focalisation) puis la mise en scène : cadre, échelle des plans, angles, mouvements de caméra, profondeur de champ, champ / hors-champ.
## 3. Comment ? — L'analyse plastique et sonore
Lumière et couleurs, décors et costumes, montage (raccords : regard, mouvement, axe ; champ-contrechamp, montage alterné ; rythme d'après la durée des plans), son (in, off, voix over, musique).
## 4. Pourquoi ? — L'interprétation et la portée (connotation)
Thèmes et motifs, références culturelles, picturales, historiques ou intertextuelles, puis une synthèse montrant comment les choix techniques servent un propos d'auteur.
## Limites
Ce que l'analyse automatique n'a pas pu observer.

Règles : cite les plans par numéro et minutage [plan 3, 0:12]. Chaque affirmation formelle s'appuie sur un plan précis. Pour le son, tu n'as que la transcription : ne décris ni musique ni bruitage non attestés et signale-le. Distingue ce qui est observé de ce qui est interprété. Style rédigé, vocabulaire précis, pas de remplissage.`;

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const KEYS = ['echelle', 'angle', 'mouvement', 'composition', 'lumiere', 'couleurs', 'decor', 'description'];

export default async function redactionHandler(req: Request, res: Response) {
  const { fiche, shots, transcript } = req.body ?? {};
  if (!Array.isArray(shots) || !shots.length) return res.status(400).json({ error: 'Aucun plan à analyser' });
  const lines = shots.slice(0, 120).map((s: any, i: number) =>
    `Plan ${i + 1} [${t(s.start)}–${t(s.end)}, ${(s.end - s.start).toFixed(1)} s] `
    + KEYS.map((k) => `${k}: ${String(s[k] ?? '').slice(0, 300)}`).join(' | ')
    + (s.note ? ` | note de l'utilisateur: ${String(s.note).slice(0, 300)}` : ''));
  try {
    const reply = await chatCompletion([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `FICHE :\n${JSON.stringify(fiche ?? {})}\n\nPLANS :\n${lines.join('\n')}\n\nTRANSCRIPTION :\n${String(transcript ?? '').slice(0, 8000) || '(aucun dialogue transcrit)'}` },
    ], { maxTokens: 5000, temperature: 0.4 });
    res.json({ markdown: reply });
  } catch (err) {
    const e = err as AlbertError;
    res.status(e.status ?? 500).json({ error: e.message });
  }
}
