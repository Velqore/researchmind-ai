// Client-side document text extraction (PDF / DOCX / TXT / MD).
// Runs entirely inside the extension — only the extracted TEXT is ever sent
// to the backend. This avoids Vercel's ~4.5MB upload limit, keeps requests
// fast, and is better for privacy. Parsers are lazy-loaded so the popup
// stays instant to open.

const MAX_CHARS = 60000;
export const MAX_FILE_MB = 20;

export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];
export const ACCEPT_ATTR = '.pdf,.docx,.txt,.md';

export async function extractFromFile(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`FILE_TOO_LARGE`);
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let text;
  if (ext === 'pdf') text = await extractPdf(file);
  else if (ext === 'docx') text = await extractDocx(file);
  else if (ext === 'txt' || ext === 'md') text = (await file.text()).slice(0, MAX_CHARS);
  else throw new Error('UNSUPPORTED_FILE');

  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('EMPTY_FILE');
  return {
    title: file.name,
    text,
    kind: ext,
    // Stable pseudo-URL so backend caching (Step 3) can dedupe identical docs.
    url: `file://${encodeURIComponent(file.name)}#${file.size}`,
  };
}

async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages && text.length < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n\n';
  }
  await doc.destroy();
  return text.slice(0, MAX_CHARS);
}

async function extractDocx(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('UNSUPPORTED_FILE');
  return xml
    .replace(/<\/w:p>/g, '\n')          // paragraph breaks
    .replace(/<w:tab[^>]*\/>/g, '\t')   // tabs
    .replace(/<[^>]+>/g, '')            // strip all remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .slice(0, MAX_CHARS);
}

export function extractErrorMessage(err) {
  switch (err?.message) {
    case 'FILE_TOO_LARGE':
      return `That file is over ${MAX_FILE_MB}MB. Try a smaller document.`;
    case 'UNSUPPORTED_FILE':
      return 'Unsupported file type. Upload a PDF, DOCX, TXT or MD file.';
    case 'EMPTY_FILE':
      return 'No readable text found — scanned/image-only PDFs aren’t supported yet.';
    default:
      return 'Couldn’t read that file. Please try another document.';
  }
}
