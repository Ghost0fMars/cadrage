import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const save = (blob: Blob, name: string) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
};

export const exportMd = (md: string) => save(new Blob([md], { type: 'text/markdown' }), 'analyse-filmique.md');

/** **gras** et *italique* en lignes de texte Word. */
const runs = (s: string) =>
  s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((p) =>
    p.startsWith('**') ? new TextRun({ text: p.slice(2, -2), bold: true }) : p.startsWith('*') && p.length > 2 ? new TextRun({ text: p.slice(1, -1), italics: true }) : new TextRun(p));

/** Markdown (titres #, listes -, paragraphes) → .docx. */
export async function exportDocx(md: string) {
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const children = md.split('\n').filter((l) => l.trim()).map((l) => {
    const h = /^(#{1,3})\s+(.*)/.exec(l);
    if (h) return new Paragraph({ heading: levels[h[1].length - 1], children: runs(h[2]) });
    const li = /^\s*[-*]\s+(.*)/.exec(l);
    return li ? new Paragraph({ bullet: { level: 0 }, children: runs(li[1]) }) : new Paragraph({ spacing: { after: 120 }, children: runs(l) });
  });
  save(await Packer.toBlob(new Document({ sections: [{ children }] })), 'analyse-filmique.docx');
}
