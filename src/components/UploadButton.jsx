import React, { useRef, useState } from 'react';
import { ACCEPT_ATTR, extractErrorMessage, extractFromFile } from '../lib/extract';

/** Small "+ upload" control used across the Pro tools and citation.
 *  Parses a PDF / DOCX / TXT / MD client-side and hands back the text. */
export default function UploadButton({ onText, label = 'Upload file' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const doc = await extractFromFile(file);
      onText(doc.text, doc.title);
    } catch (e) {
      setErr(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="chip disabled:opacity-60"
      >
        {busy ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-violet/40 border-t-brand-violet" />
            Reading…
          </span>
        ) : (
          <>＋ {label}</>
        )}
      </button>
      {err && <p className="mt-1 text-[10.5px] font-medium text-rose-400">{err}</p>}
    </>
  );
}
