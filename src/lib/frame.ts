/** Une détection de LocateAnything : coordonnées normalisées 0-1000 ([x1, y1, x2, y2] pour une boîte, [x, y] pour un point). */
export interface Detection { label: string; type: 'box' | 'point'; coords: number[] }

const boxes = (d: Detection[], re: RegExp) => d.filter((x) => x.type === 'box' && x.coords.length === 4 && re.test(x.label));
const height = (b: Detection) => (b.coords[3] - b.coords[1]) / 1000;
const biggest = (b: Detection[]) => Math.max(0, ...b.map(height));

/** Valeur de plan estimée d'après la taille du visage (à défaut, du personnage) dans le cadre ; null si indécidable. */
export function sizeFromDetections(d: Detection[]): string | null {
  const faces = boxes(d, /face|visage|head|t[eê]te/i);
  if (faces.length) {
    const f = biggest(faces);
    return f >= 0.5 ? 'GP' : f >= 0.3 ? 'PR' : f >= 0.17 ? 'PM' : f >= 0.1 ? 'PA' : f >= 0.04 ? 'PE' : 'PG';
  }
  const people = boxes(d, /person|people|human|personne/i);
  if (!people.length) return null;
  const p = biggest(people);
  return p < 0.12 ? 'PG' : p < 0.85 ? 'PE' : null; // un personnage cadré de près est indécidable sans son visage
}

/** Phrase de composition : combien de personnages, où, et la valeur de plan estimée. */
export function describeFrame(d: Detection[]): string {
  const people = boxes(d, /person|people|human|personne/i);
  const where = (b: Detection) => { const x = (b.coords[0] + b.coords[2]) / 2000; return x < 0.4 ? 'à gauche' : x > 0.6 ? 'à droite' : 'au centre'; };
  const size = sizeFromDetections(d);
  const count = (w: string) => people.filter((p) => where(p) === w).length;
  const spread = ['à gauche', 'au centre', 'à droite'].flatMap((w) => (count(w) ? [people.length > 1 ? `${count(w)} ${w}` : w] : [])).join(', ');
  const parts = [people.length ? `${people.length} personnage${people.length > 1 ? 's' : ''} (${spread})` : 'aucun personnage repéré'];
  if (size) parts.push(`valeur de plan estimée : ${size}`);
  return parts.join(' · ');
}

/** Image choisie → JPEG redimensionné (côté long ≤ max px), en data URL. */
export function toJpeg(file: File, max = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

/** Réduit un data URL JPEG pour le stockage local (vignette). */
export const thumb = (dataUrl: string) =>
  new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 640 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
