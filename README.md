# Cadrage

Analyse de séquence filmique selon le modèle **Quoi ? Comment ? Pourquoi ?** (identification et contexte, narration, plastique et sonore, interprétation).

Chaîne : extrait vidéo → plans (différence d'images, dans le navigateur) → LocateAnything (personnages, échelle, composition) + Albert vision (lumière, couleurs, décor, angle, mouvement) + Whisper (dialogues) → rédaction Albert → export Word / Markdown.

```
npm install
npm run api   # API locale :3202
npm run dev   # interface :3200
npm test
```

`.env.local` : `ALBERT_API_KEY` (voir `.env.example`). Optionnel : `LOCATE_URL`, `LOCATE_HF_TOKEN`, `LOCATE_MOCK=1`.

Limites connues : coupes situées à ± 0,25 s ; extrait de 5 min au plus ; musique et bruitages non analysés (seul le dialogue est transcrit) ; LocateAnything (NVIDIA) est sous licence non commerciale.
