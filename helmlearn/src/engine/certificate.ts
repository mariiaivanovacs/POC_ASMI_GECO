import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Certificate, ComplianceRegime, Learner, Material } from '../data/types';

function fmt(t: number): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function verificationCode(learnerId: string, materialId: string, issuedAt: number): string {
  const raw = learnerId + '|' + materialId + '|' + issuedAt;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return 'HL-' + hex.slice(0, 4) + '-' + hex.slice(4);
}

export interface CertParams {
  learner: Learner;
  material: Material;
  cert: Certificate;
  regimes: ComplianceRegime[];
  score: number | null;
  org?: string;
}

// pdf-lib's standard Helvetica is WinAnsi-only: subscripts, CJK and typographic dashes throw.
const SUBSCRIPT: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
export function pdfSafe(text: string): string {
  return text
    .replace(/[₀-₉]/g, (c) => SUBSCRIPT[c] || c)
    .replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff·]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

export async function buildCertificatePdf(p: CertParams): Promise<Uint8Array> {
  const org = p.org || 'Harbourline Marine Services Pte Ltd';
  const doc = await PDFDocument.create();
  doc.setTitle('Certificate of Completion — ' + p.material.short);
  doc.setSubject('Issued by HelmLearn');
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.173, 0.290, 0.486);
  const ink = rgb(0.118, 0.169, 0.271);
  const muted = rgb(0.541, 0.592, 0.678);
  const gold = rgb(0.949, 0.663, 0.231);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.976, 0.984, 0.992) });
  page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: navy });
  page.drawRectangle({ x: 0, y: 0, width, height: 14, color: navy });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: gold, borderWidth: 2 });

  const centerText = (raw: string, y: number, size: number, font = reg, color = ink) => {
    const text = pdfSafe(raw);
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  centerText('HELMLEARN', height - 70, 14, bold, muted);
  centerText('CERTIFICATE OF COMPLETION', height - 105, 28, bold, navy);
  centerText(org, height - 132, 13, reg, muted);

  centerText('This certifies that', height - 190, 13, reg, muted);
  centerText(p.learner.name, height - 225, 30, bold, ink);
  centerText(p.learner.role + '  ·  ' + p.learner.dept + '  ·  ' + p.learner.code, height - 248, 12, reg, muted);

  centerText('has completed', height - 285, 13, reg, muted);
  centerText(p.material.name, height - 315, 18, bold, navy);

  const regimesLine = p.regimes.length ? 'Evidence toward: ' + p.regimes.map((r) => r.name + ' (' + r.authority + ')').join('  ·  ') : 'General training completion — not mapped to a specific compliance regime.';
  centerText(regimesLine, height - 340, 10.5, reg, muted);

  const scoreLine = p.score === null ? '' : 'Average assessment score: ' + p.score + '%';
  if (scoreLine) centerText(scoreLine, height - 362, 11, reg, ink);

  const colY = 120;
  page.drawText('Issued', { x: 90, y: colY + 34, size: 9, font: bold, color: muted });
  page.drawText(fmt(p.cert.issuedAt), { x: 90, y: colY + 16, size: 12, font: reg, color: ink });
  page.drawText('Valid until', { x: 320, y: colY + 34, size: 9, font: bold, color: muted });
  page.drawText(fmt(p.cert.expiresAt), { x: 320, y: colY + 16, size: 12, font: reg, color: ink });
  page.drawText('Verification code', { x: 550, y: colY + 34, size: 9, font: bold, color: muted });
  page.drawText(p.cert.code, { x: 550, y: colY + 16, size: 12, font: bold, color: navy });

  page.drawLine({ start: { x: 90, y: 80 }, end: { x: 280, y: 80 }, thickness: 1, color: muted });
  page.drawText(pdfSafe('Issued by ' + p.cert.issuedBy), { x: 90, y: 66, size: 10, font: reg, color: muted });
  page.drawLine({ start: { x: 550, y: 80 }, end: { x: 740, y: 80 }, thickness: 1, color: muted });
  page.drawText('HelmLearn training record', { x: 550, y: 66, size: 10, font: reg, color: muted });

  centerText('This certificate records completion inside HelmLearn and is not, by itself, a statutory or regulator-issued qualification.', 46, 8.5, reg, muted);

  return doc.save();
}

export function certificateFileName(learner: Learner, material: Material): string {
  const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');
  return 'Certificate_' + slug(learner.name) + '_' + slug(material.short) + '.pdf';
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([bytes.slice().buffer], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
