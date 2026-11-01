import { cutIndices, spansFromCuts, type Span } from './cuts';

export const STEP = 0.25; // pas d'échantillonnage (s) : une coupe est située à ± STEP
export const MAX_DURATION = 300; // extrait de 5 min au plus

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  await new Promise<void>((ok, ko) => { v.onloadeddata = () => ok(); v.onerror = () => ko(new Error('Vidéo illisible par le navigateur (essayez MP4 H.264 ou WebM)')); });
  return v;
}

const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = Math.min(t, Math.max(0, v.duration - 0.05)); });

/** Image de la vidéo au temps t, en JPEG (côté long ≤ max px). */
export async function grab(v: HTMLVideoElement, t: number, max = 1024): Promise<string> {
  await seek(v, t);
  const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Détecte les plans par différence d'images successives (vignettes 32×18 en niveaux de gris). */
export async function detectShots(v: HTMLVideoElement, onProgress: (p: number) => void): Promise<Span[]> {
  const duration = Math.min(v.duration, MAX_DURATION);
  const c = Object.assign(document.createElement('canvas'), { width: 32, height: 18 });
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const diffs: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  const n = Math.floor(duration / STEP);
  for (let i = 0; i < n; i++) {
    await seek(v, i * STEP);
    ctx.drawImage(v, 0, 0, 32, 18);
    const px = ctx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    if (prev) for (let j = 0; j < px.length; j += 4) sum += Math.abs(px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11 - (prev[j] * 0.3 + prev[j + 1] * 0.59 + prev[j + 2] * 0.11));
    diffs.push(prev ? sum / (px.length / 4) : 0);
    prev = px;
    onProgress((i + 1) / n);
  }
  return spansFromCuts(cutIndices(diffs), STEP, duration);
}

const wav = (pcm: Float32Array, rate: number): string => {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
};

/** Piste audio → morceaux WAV 16 kHz mono de 60 s (limite de taille des requêtes) ; [] si pas d'audio décodable. */
export async function audioChunks(file: File, seconds: number): Promise<{ offset: number; audio: string }[]> {
  const RATE = 16000, LEN = 60;
  try {
    const decoded = await new AudioContext().decodeAudioData(await file.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.ceil(Math.min(decoded.duration, seconds) * RATE), RATE);
    const src = off.createBufferSource();
    src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    return Array.from({ length: Math.ceil(pcm.length / (RATE * LEN)) }, (_, i) => ({ offset: i * LEN, audio: wav(pcm.subarray(i * RATE * LEN, (i + 1) * RATE * LEN), RATE) }));
  } catch {
    return [];
  }
}
