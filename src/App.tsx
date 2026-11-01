import { useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clapperboard, Download, FileText, Film, Loader2, Scissors, Sparkles, X } from 'lucide-react';
import { describeFrame, type Detection } from './lib/frame';
import { exportDocx, exportMd } from './lib/export';
import { audioChunks, detectShots, grab, loadVideo, MAX_DURATION } from './lib/video';

const FIELDS = [
  ['echelle', 'Échelle'], ['angle', 'Angle'], ['mouvement', 'Mouvement'], ['composition', 'Composition, profondeur, champ'],
  ['lumiere', 'Lumière'], ['couleurs', 'Couleurs'], ['decor', 'Décors et costumes'], ['description', 'Action'], ['note', 'Votre note'],
] as const;
type Field = (typeof FIELDS)[number][0];
type Shot = { start: number; end: number; thumb: string; locate: string; done: boolean } & Record<Field, string>;
const FICHE = [['titre', 'Titre'], ['realisateur', 'Réalisateur'], ['annee', 'Année'], ['pays', 'Pays'], ['acteurs', 'Acteurs principaux'], ['genre', 'Genre, adaptation ou création'], ['contexte', 'Contexte (époque, mouvement, style)']] as const;

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const empty = (): Record<Field, string> => Object.fromEntries(FIELDS.map(([k]) => [k, ''])) as Record<Field, string>;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data as T;
}

const btn = 'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50';
const input = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm';

export default function App() {
  const video = useRef<HTMLVideoElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fiche, setFiche] = useState<Record<string, string>>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [transcript, setTranscript] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const patch = (i: number, p: Partial<Shot>) => setShots((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const pick = (f: File | null) => { setFile(f); setShots([]); setMarkdown(''); setTranscript(''); video.current = null; };

  const cut = () => run('Détection des plans…', async () => {
    const v = (video.current = await loadVideo(file!));
    const spans = await detectShots(v, (p) => setBusy(`Détection des plans… ${Math.round(p * 100)} %`));
    const out: Shot[] = [];
    for (const s of spans) out.push({ ...s, ...empty(), thumb: await grab(v, (s.start + s.end) / 2, 320), locate: '', done: false });
    setShots(out);
  });

  // Un plan retiré est absorbé par le précédent (ou le suivant s'il est le premier).
  const drop = (i: number) => setShots((s) => {
    const k = i > 0 ? i - 1 : 1;
    if (!s[k]) return s;
    const merged = i > 0 ? { ...s[k], end: s[i].end } : { ...s[k], start: s[i].start };
    return s.flatMap((x, j) => (j === i ? [] : j === k ? [{ ...merged, done: false }] : [x]));
  });

  const analyse = () => run('Analyse des plans…', async () => {
    const v = video.current!;
    const chunks = audioChunks(file!, MAX_DURATION).then(async (cs) => {
      const parts: string[] = [];
      for (const c of cs) parts.push((await post<{ text: string }>('/api/transcrire', { audio: c.audio }).catch(() => ({ text: '' }))).text);
      setTranscript(parts.join(' ').trim());
    });
    for (let i = 0; i < shots.length; i++) {
      setBusy(`Analyse du plan ${i + 1} / ${shots.length}…`);
      const { start, end } = shots[i];
      const times = end - start < 1 ? [(start + end) / 2] : [0.2, 0.5, 0.8].map((k) => start + (end - start) * k);
      const images: string[] = [];
      for (const tt of times) images.push(await grab(v, tt));
      let detections: Detection[] = [];
      try { detections = (await post<{ detections: Detection[] }>('/api/locate', { image: images[times.length > 1 ? 1 : 0] })).detections; } catch { /* LocateAnything facultatif : le plan est analysé sans */ }
      const plan = await post<Record<string, string>>('/api/plan', { images, detections });
      patch(i, { ...plan, locate: detections.length ? describeFrame(detections) : '', done: true });
    }
    setBusy('Transcription des dialogues…');
    await chunks;
  });

  const write = () => run('Rédaction de l’analyse…', async () => {
    setMarkdown((await post<{ markdown: string }>('/api/redaction', { fiche, shots, transcript })).markdown);
  });

  const analysed = shots.length > 0 && shots.every((s) => s.done);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Clapperboard className="size-5" /> Cadrage <span className="text-sm font-normal text-muted-foreground">— analyse de séquence : Quoi ? Comment ? Pourquoi ?</span></h1>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {error && <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">{error}</p>}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Votre extrait et sa fiche</h2>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm">
            <Film className="size-4" /> {file ? file.name : `Déposer ou choisir un extrait (MP4 ou WebM, ${MAX_DURATION / 60} min maximum)`}
            <input type="file" accept="video/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {FICHE.map(([k, label]) => (
              <label key={k} className={`text-sm ${k === 'contexte' ? 'sm:col-span-2' : ''}`}>{label}
                <input className={input} value={fiche[k] ?? ''} onChange={(e) => setFiche({ ...fiche, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <button className={btn} disabled={!file || !!busy} onClick={cut}><Scissors className="size-4" /> Découper en plans</button>
        </section>

        {shots.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">2. Les plans ({shots.length})</h2>
            <p className="text-sm text-muted-foreground">Vérifiez le découpage : retirez un plan pour le fondre dans le précédent, puis lancez l’analyse. Chaque champ reste modifiable ensuite.</p>
            <button className={btn} disabled={!!busy} onClick={analyse}><Sparkles className="size-4" /> Analyser les plans (images, personnages, dialogues)</button>
            <ol className="space-y-3">
              {shots.map((s, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <div className="flex gap-3">
                    <img src={s.thumb} alt={`Plan ${i + 1}`} className="h-20 w-auto rounded" />
                    <div className="flex-1 text-sm">
                      <p className="font-medium">Plan {i + 1} · {t(s.start)}–{t(s.end)} ({(s.end - s.start).toFixed(1)} s)</p>
                      <p className="text-muted-foreground">{s.description || 'À analyser'}</p>
                      {s.locate && <p className="text-xs text-muted-foreground">LocateAnything : {s.locate}</p>}
                    </div>
                    <button aria-label={`Retirer le plan ${i + 1}`} className="self-start" disabled={shots.length < 2 || !!busy} onClick={() => drop(i)}><X className="size-4" /></button>
                  </div>
                  {s.done && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm">Modifier</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {FIELDS.map(([k, label]) => (
                          <label key={k} className="text-xs">{label}
                            <textarea rows={2} className={input} value={s[k]} onChange={(e) => patch(i, { [k]: e.target.value })} />
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {analysed && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. L’analyse rédigée</h2>
            {transcript && <details><summary className="cursor-pointer text-sm">Dialogues transcrits</summary><p className="mt-2 text-sm">{transcript}</p></details>}
            <button className={btn} disabled={!!busy} onClick={write}><FileText className="size-4" /> Rédiger l’analyse</button>
            {markdown && (
              <>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => exportDocx(markdown)}><Download className="size-4" /> Word</button>
                  <button className={btn} onClick={() => exportMd(markdown)}><Download className="size-4" /> Markdown</button>
                </div>
                <article className="space-y-3 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                  <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
                </article>
                <p className="text-xs text-muted-foreground">Analyse produite par IA à partir des images et des dialogues : l’IA propose, vous décidez. Relisez, corrigez, et vérifiez les éléments marqués « (à vérifier) ».</p>
              </>
            )}
          </section>
        )}
      </main>
      {busy && (
        <div role="status" className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm shadow">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </div>
      )}
    </div>
  );
}
