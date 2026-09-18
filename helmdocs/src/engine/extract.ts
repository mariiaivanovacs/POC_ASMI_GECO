export class ExtractError extends Error {
  constructor(message: string, public code: 'unsupported' | 'empty' | 'no-text' | 'too-long' | 'corrupt') {
    super(message);
  }
}

export interface Extracted { text: string; pages: number; ext: string; kind: string }

export const MAX_PAGES = 100;
export const MAX_CHARS = 400_000;
const SUPPORTED = ['pdf', 'docx', 'txt', 'md'];

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function kindOf(ext: string): string {
  return { pdf: 'PDF form', docx: 'Word form', txt: 'Text form', md: 'Markdown form' }[ext] || 'File';
}

export async function extractText(file: File, onProgress?: (pct: number) => void): Promise<Extracted> {
  const ext = extOf(file.name);
  if (!SUPPORTED.includes(ext)) throw new ExtractError('Unsupported file type ".' + ext + '". Upload a PDF, Word (.docx), .txt or .md form.', 'unsupported');
  if (file.size === 0) throw new ExtractError('The file is empty (0 bytes).', 'empty');

  let text = '';
  let pages = 1;
  if (ext === 'txt' || ext === 'md') {
    text = await file.text();
    pages = Math.max(1, Math.ceil(text.length / 3000));
    onProgress?.(100);
  } else if (ext === 'pdf') {
    const r = await extractPdf(file, onProgress);
    text = r.text; pages = r.pages;
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth');
    let result;
    try { result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); }
    catch { throw new ExtractError('Could not open this Word file — it may be corrupt or password-protected.', 'corrupt'); }
    text = result.value;
    pages = Math.max(1, Math.ceil(text.length / 3000));
    onProgress?.(100);
  }

  text = text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  if (text.replace(/\s+/g, '').length < 20) {
    throw new ExtractError(
      ext === 'pdf' ? 'No readable text layer — this looks like a scanned PDF. OCR is not part of the offline engine; export the form from its source application instead.' : 'No readable text found in this file.',
      'no-text',
    );
  }
  if (pages > MAX_PAGES) throw new ExtractError('This file has ' + pages + ' pages; the limit is ' + MAX_PAGES + '.', 'too-long');
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { text, pages, ext, kind: kindOf(ext) };
}

async function extractPdf(file: File, onProgress?: (pct: number) => void): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try { doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; }
  catch { throw new ExtractError('Could not open this PDF — it may be corrupt or password-protected.', 'corrupt'); }
  const pages = doc.numPages;
  if (pages > MAX_PAGES) throw new ExtractError('This file has ' + pages + ' pages; the limit is ' + MAX_PAGES + '.', 'too-long');
  const parts: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let last: number | null = null;
    let line = '';
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(item.transform[5]);
      if (last !== null && Math.abs(y - last) > 2) { parts.push(line); line = ''; }
      line += (line ? ' ' : '') + item.str;
      last = y;
    }
    if (line) parts.push(line);
    parts.push('');
    onProgress?.(Math.round((p / pages) * 100));
    await new Promise((r) => setTimeout(r, 0));
  }
  return { text: parts.join('\n'), pages };
}
