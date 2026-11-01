# Cadrage

Analyse de séquence filmique selon le modèle **Quoi ? Comment ? Pourquoi ?** : identification et contexte, narration, analyse plastique et sonore, interprétation.

On dépose un extrait vidéo, l'application le découpe en plans, décrit chacun d'eux, transcrit les dialogues, puis rédige une analyse structurée exportable en Word ou en Markdown.

## Fonctionnement

```
extrait vidéo
   │  (navigateur)
   ├─► détection des coupes par différence d'images ─► plans
   │                                                     │
   │   pour chaque plan, 1 à 3 images (début, milieu, fin)
   │                                                     ▼
   │                         LocateAnything ─► personnages, visages, échelle, composition
   │                         Albert (vision) ─► angle, mouvement, lumière, couleurs, décor
   │
   └─► audio découpé en blocs de 60 s ─► Whisper (Albert) ─► dialogues

fiche saisie + plans + dialogues ─► Albert (rédaction) ─► analyse Markdown ─► export .docx / .md
```

| Étape | Où | Détail |
|---|---|---|
| Découpage en plans | Navigateur (`src/lib/cuts.ts`, `video.ts`) | Échantillonnage toutes les 0,25 s. Une coupe est un pic d'écart entre images, pas un mouvement de caméra soutenu (travelling, panoramique). |
| Échelle de plan | `src/lib/frame.ts` | Estimée d'après la taille du visage (à défaut, du personnage) dans le cadre : PG, PE, PA, PM, PR, GP. |
| Détection | `api/locate.ts` | Appelle un Space Gradio LocateAnything (NVIDIA). |
| Description | `api/plan.ts` | Modèle vision d'Albert : échelle, angle, mouvement, composition, lumière, couleurs, décor, action. Le modèle décrit sans interpréter et écrit « non observable » plutôt que de deviner. |
| Dialogues | `api/transcrire.ts` | `whisper-large-v3` via Albert, sur de l'audio WAV 16 kHz mono. |
| Rédaction | `api/redaction.ts` | Albert rédige l'analyse en citant chaque plan par numéro et minutage (`[plan 3, 0:12]`). |
| Export | `src/lib/export.ts` | Markdown ou Word (`docx`). |

## Prérequis

- Node.js récent (les types du projet visent Node 22)
- Une clé d'API [Albert](https://albert.api.etalab.gouv.fr) (API de l'État, compatible OpenAI)
- Un navigateur capable de lire la vidéo (MP4 H.264 ou WebM)

## Installation

```bash
npm install
cp .env.example .env.local   # puis renseigner ALBERT_API_KEY
```

## Lancement en local

Deux processus, dans deux terminaux :

```bash
npm run api   # API locale (Express) : http://localhost:3202
npm run dev   # interface (Vite) : http://localhost:3200
```

Vite redirige `/api` vers le port 3202. Ouvrir ensuite http://localhost:3200.

## Configuration

Variables lues dans `.env.local` (le fichier n'est jamais versionné) :

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `ALBERT_API_KEY` | oui | : | Clé de l'API Albert. |
| `ALBERT_MODEL` | non | `mistral-small-3-2-24b-instruct-2506` | Modèle de rédaction. |
| `ALBERT_VISION_MODEL` | non | `mistral-small-3-2-24b-instruct-2506` | Modèle de description des images. |
| `ALBERT_BASE_URL` | non | `https://albert.api.etalab.gouv.fr/v1` | Point d'accès de l'API. |
| `LOCATE_URL` | non | Space public de NVIDIA | Space Gradio LocateAnything à interroger. |
| `LOCATE_HF_TOKEN` | non | : | Jeton Hugging Face, pour utiliser le quota de votre compte. |
| `LOCATE_MOCK` | non | : | Si défini (`1`), renvoie des détections fictives : permet de tester l'interface sans LocateAnything. |

## API

Quatre routes `POST`, identiques en local (Express, `server.ts`) et en production (fonctions Vercel, dossier `api/`) :

| Route | Entrée | Sortie |
|---|---|---|
| `/api/locate` | `image` (data URL JPEG ou PNG), `categories` | `detections` : étiquette, type (`box` ou `point`), coordonnées normalisées 0-1000. |
| `/api/plan` | images du plan, détections éventuelles | Les huit champs d'analyse du plan. |
| `/api/transcrire` | `audio` (data URL WAV, 60 s au plus) | `text` et `segments` horodatés. |
| `/api/redaction` | `fiche`, `shots`, `transcript` | L'analyse rédigée, en Markdown. |

Le corps JSON est limité à 25 Mo en local.

## Structure

```
api/              fonctions serveur (locate, plan, transcrire, redaction) et client Albert (_albert.ts)
src/App.tsx       interface
src/lib/          cuts, video, frame, export
scripts/check.ts  vérifications
server.ts         serveur Express local
vercel.json       configuration de déploiement
```

## Tests et vérifications

```bash
npm test        # scripts/check.ts : détection des coupes, flux SSE Gradio, lecture du JSON du modèle
npm run lint    # contrôle des types (tsc --noEmit)
npm run build   # build de production dans dist/
```

## Déploiement

Le projet est prêt pour Vercel (`vercel.json`) : build Vite vers `dist/`, fonctions `api/*.ts` limitées à 60 s et `api/locate.ts` à 300 s. Renseigner dans le projet Vercel les variables d'environnement du tableau ci-dessus.

## Limites connues

- Les coupes sont situées à ± 0,25 s.
- L'extrait ne peut pas dépasser 5 minutes.
- La musique et les bruitages ne sont pas analysés : seul le dialogue est transcrit, et l'analyse le signale.
- Les descriptions et l'analyse viennent d'un modèle de langage : elles sont à relire et à vérifier. Les éléments incertains du contexte sont marqués « (à vérifier) ».
- **Licence de LocateAnything** : le modèle de NVIDIA est sous licence non commerciale (recherche et usage associatif). Ne pas l'utiliser dans un cadre commercial.
