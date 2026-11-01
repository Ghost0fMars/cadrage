/** Un plan : intervalle en secondes dans l'extrait. */
export interface Span { start: number; end: number }

/**
 * diffs[i] = écart moyen (0-255) entre l'échantillon i et i-1 ; renvoie les indices où commence un nouveau plan.
 * Une coupe est un pic net : au-dessus du seuil et au moins deux fois la moyenne des écarts précédents
 * (un mouvement de caméra donne des écarts soutenus, pas un pic).
 */
export function cutIndices(diffs: number[], min = 30): number[] {
  const cuts: number[] = [];
  for (let i = 1; i < diffs.length; i++) {
    const before = diffs.slice(Math.max(1, i - 4), i);
    const avg = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
    if (diffs[i] > min && diffs[i] > 2 * avg && cuts[cuts.length - 1] !== i - 1) cuts.push(i);
  }
  return cuts;
}

/** Plans consécutifs d'après les indices de coupe, l'échantillonnage (s) et la durée totale. */
export function spansFromCuts(cuts: number[], step: number, duration: number): Span[] {
  const t = [0, ...cuts.map((i) => i * step), duration];
  return t.slice(0, -1).map((start, i) => ({ start, end: t[i + 1] })).filter((s) => s.end - s.start > 0);
}
