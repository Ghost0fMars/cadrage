import type { Request, Response } from 'express';
import { AlbertError, transcribe } from './_albert.js';

/** Transcrit un extrait audio (≤ 60 s, WAV 16 kHz mono en data URL) ; le client découpe l'audio. */
export default async function transcrireHandler(req: Request, res: Response) {
  const { audio } = req.body ?? {};
  const m = typeof audio === 'string' ? /^data:audio\/wav;base64,(.+)$/.exec(audio) : null;
  if (!m) return res.status(400).json({ error: 'Audio manquant (WAV en base64)' });
  try {
    res.json(await transcribe(Buffer.from(m[1], 'base64')));
  } catch (err) {
    const e = err as AlbertError;
    res.status(e.status ?? 500).json({ error: e.message });
  }
}
