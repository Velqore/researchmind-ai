// Client-side exporters for summaries — Markdown (Notion-ready), Word (.doc),
// and PDF (via the browser's print-to-PDF). All dependency-free so they work in
// both the extension popup and the web app without inflating the bundle.

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text: drop the ** markers, keep bullets — good for clipboard/Notion. */
export function summaryToText(title, summary, url = '') {
  const body = summary.replace(/\*\*/g, '');
  return [title, '='.repeat(Math.min(title.length, 60)), '', body, '', url ? `Source: ${url}` : '']
    .filter((l) => l !== undefined)
    .join('\n')
    .trim();
}

/** Markdown that pastes cleanly into Notion, Obsidian, GitHub, etc. */
export function summaryToMarkdown(title, summary, url = '') {
  const parts = [`# ${title}`, ''];
  if (url) parts.push(`> Source: [${url}](${url})`, '');
  parts.push(summary.trim());
  parts.push('', '---', '_Summarized with ResearchMind AI_');
  return parts.join('\n');
}

/** Render the markdown subset (**bold**, headers, bullets) to HTML for Word/PDF. */
function summaryToHtmlBody(summary) {
  const inline = (t) =>
    t
      .split(/(\*\*[^*]+\*\*)/g)
      .map((p) =>
        p.startsWith('**') && p.endsWith('**') ? `<strong>${esc(p.slice(2, -2))}</strong>` : esc(p)
      )
      .join('');

  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      out.push('<ul>' + bullets.map((b) => `<li>${b}</li>`).join('') + '</ul>');
      bullets = [];
    }
  };
  for (const raw of summary.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      out.push(`<h2>${inline(h[1].replace(/\*\*/g, ''))}</h2>`);
    } else if (/^[•\-–*]\s/.test(line)) {
      bullets.push(inline(line.replace(/^[•\-–*]\s*/, '')));
    } else if (/^\d+\.\s/.test(line)) {
      bullets.push(inline(line.replace(/^\d+\.\s*/, '')));
    } else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join('\n');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (title) =>
  (title || 'summary')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'summary';

export function downloadMarkdown(title, summary, url = '') {
  const blob = new Blob([summaryToMarkdown(title, summary, url)], {
    type: 'text/markdown;charset=utf-8',
  });
  triggerDownload(blob, `${safeName(title)}.md`);
}

/** Word-openable document. A .doc file that is actually HTML opens natively in
 *  Microsoft Word and Google Docs — no heavy docx library needed. */
export function downloadWord(title, summary, url = '') {
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1b1e26;line-height:1.5;}
  h1{font-size:18pt;color:#0f172a;margin:0 0 6pt;}
  h2{font-size:13pt;color:#0f766e;margin:14pt 0 4pt;}
  p{margin:6pt 0;} li{margin:3pt 0;}
  .src{color:#555;font-size:9pt;} .foot{color:#888;font-size:8.5pt;margin-top:18pt;border-top:1px solid #ddd;padding-top:6pt;}
</style></head><body>
<h1>${esc(title)}</h1>
${url ? `<p class="src">Source: <a href="${esc(url)}">${esc(url)}</a></p>` : ''}
${summaryToHtmlBody(summary)}
<p class="foot">Summarized with ResearchMind AI</p>
</body></html>`;
  triggerDownload(new Blob([html], { type: 'application/msword' }), `${safeName(title)}.doc`);
}

/** Open a print-ready window; the user picks "Save as PDF" in the print dialog.
 *  Returns false if a popup was blocked so the caller can hint at it. */
export function exportPdf(title, summary, url = '') {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page{margin:18mm;}
  body{font-family:Georgia,'Times New Roman',serif;color:#1b1e26;line-height:1.6;max-width:720px;margin:0 auto;padding:24px;}
  h1{font-size:24px;margin:0 0 8px;}
  h2{font-size:16px;color:#0f766e;margin:20px 0 6px;font-family:Arial,sans-serif;}
  p{margin:8px 0;} li{margin:4px 0;}
  .src{color:#666;font-size:12px;font-family:Arial,sans-serif;}
  .foot{margin-top:28px;padding-top:8px;border-top:1px solid #ddd;color:#888;font-size:11px;font-family:Arial,sans-serif;}
</style></head><body>
<h1>${esc(title)}</h1>
${url ? `<p class="src">Source: ${esc(url)}</p>` : ''}
${summaryToHtmlBody(summary)}
<p class="foot">Summarized with ResearchMind AI · airesearch-mind.vercel.app</p>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
</body></html>`);
  w.document.close();
  return true;
}
