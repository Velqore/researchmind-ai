import React, { useRef, useState } from 'react';
import { useApp } from '../../AppContext';
import { getCurrentPage, summarize } from '../../lib/api';
import { ACCEPT_ATTR, extractErrorMessage, extractFromFile } from '../../lib/extract';
import { isWeb } from '../../lib/storage';
import ErrorCard from '../ErrorCard';
import LimitBanner from '../LimitBanner';
import RichText from '../RichText';
import { SkeletonCard } from '../Skeleton';
import UsageBar from '../UsageBar';

const LENGTHS = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'detailed', label: 'Detailed' },
];

const FILE_ICONS = { pdf: '📕', docx: '📘', txt: '📄', md: '📄' };

export default function HomeTab() {
  const { isPro, license, remainingFor, useFeature, usage, limits } = useApp();
  const [length, setLength] = useState('medium');
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [errorKind, setErrorKind] = useState('server');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Uploaded document (PDF / DOCX / TXT / MD), parsed client-side
  const fileInputRef = useRef(null);
  const [doc, setDoc] = useState(null); // { title, text, kind, url }
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Web mode: summarize a pasted link (the backend fetches it server-side)
  const [urlInput, setUrlInput] = useState('');

  const left = remainingFor('summarize');
  const limitHit = !isPro && left === 0;

  const runSummarize = async (source) => {
    if (!navigator.onLine) {
      setErrorKind('offline');
      setState('error');
      return;
    }
    setState('loading');
    setResult(null);
    try {
      const res = await summarize({
        url: source.url,
        title: source.title,
        text: source.text,
        length,
        licenseKey: license.key,
      });
      // Free credit is only consumed after a successful response —
      // failed requests never cost the user a use.
      const allowed = await useFeature('summarize');
      if (!allowed) {
        setState('idle');
        return;
      }
      setResult({ ...res, pageTitle: source.title || res.title, url: source.url });
      setState('done');
    } catch {
      setErrorKind('server');
      setState('error');
    }
  };

  const summarizePage = async () => {
    let page;
    try {
      page = await getCurrentPage();
    } catch {
      setErrorKind('page');
      setState('error');
      return;
    }
    await runSummarize(page);
  };

  const summarizeDoc = () => doc && runSummarize(doc);

  const summarizeUrl = () => {
    const url = urlInput.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) {
      setErrorKind('server');
      setFileError('Please enter a full link starting with http:// or https://');
      return;
    }
    setFileError('');
    runSummarize({ url, title: '', text: '' });
  };

  const handleFile = async (file) => {
    if (!file) return;
    setFileError('');
    setExtracting(true);
    setDoc(null);
    try {
      setDoc(await extractFromFile(file));
    } catch (err) {
      setFileError(extractErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const copySummary = async () => {
    if (!result?.summary) return;
    await navigator.clipboard.writeText(result.summary.replace(/\*\*/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 py-2">
      {/* ---- Summarize hero ---- */}
      <div className="glass p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-white">Summarize anything</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              This page, or upload a paper — clean structured summary
            </p>
          </div>
          <span className="text-xl">📄</span>
        </div>

        <div className="mb-3 flex gap-1.5" role="radiogroup" aria-label="Summary length">
          {LENGTHS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={length === l.id}
              onClick={() => setLength(l.id)}
              className={`chip ${length === l.id ? 'chip-active' : ''}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {limitHit ? (
          <LimitBanner />
        ) : (
          <>
            {/* Page mode and document mode are mutually exclusive — with a
                document loaded, its card below is the single primary action.
                Web mode swaps "current page" for a link input (a website
                can't read other tabs — the backend fetches the URL). */}
            {!doc && !extracting && (
              isWeb ? (
                <>
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && summarizeUrl()}
                    placeholder="Paste a link — article, paper, blog post…"
                    spellCheck={false}
                    className="input-dark"
                    aria-label="Link to summarize"
                  />
                  <button
                    onClick={summarizeUrl}
                    disabled={state === 'loading' || !urlInput.trim()}
                    className="btn-primary mt-2.5"
                  >
                    {state === 'loading' ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Reading & summarizing…
                      </>
                    ) : (
                      <>✨ Summarize link</>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={summarizePage}
                  disabled={state === 'loading'}
                  className="btn-primary"
                >
                  {state === 'loading' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Reading & summarizing…
                    </>
                  ) : (
                    <>✨ Summarize current page</>
                  )}
                </button>
              )
            )}

            {/* ---- Document upload ---- */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            {!doc && !extracting && (
              <button
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-[12px] font-medium transition-all duration-200 ${
                  dragging
                    ? 'border-brand-violet bg-brand-violet/[0.12] text-brand-violet'
                    : 'border-white/15 bg-white/[0.02] text-slate-400 hover:border-brand-violet/50 hover:bg-white/[0.05] hover:text-slate-300'
                }`}
              >
                📎 Upload PDF, DOCX or TXT
              </button>
            )}

            {extracting && (
              <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-violet/40 border-t-brand-violet" />
                Reading document…
              </div>
            )}

            {doc && (
              <div className="animate-scale-in mt-2.5 rounded-xl border border-brand-violet/25 bg-brand-violet/[0.08] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{FILE_ICONS[doc.kind] ?? '📄'}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-200">
                    {doc.title}
                  </span>
                  <button
                    onClick={() => setDoc(null)}
                    aria-label="Remove document"
                    className="shrink-0 rounded-md px-1.5 text-[13px] text-slate-500 transition-colors hover:text-rose-400"
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={summarizeDoc}
                  disabled={state === 'loading'}
                  className="btn-primary mt-2.5 py-2.5"
                >
                  {state === 'loading' ? 'Summarizing…' : '✨ Summarize document'}
                </button>
              </div>
            )}

            {fileError && (
              <p className="animate-fade-in mt-2 text-center text-[11.5px] font-medium text-rose-400">
                {fileError}
              </p>
            )}

            <div className="mt-3">
              <UsageBar feature="summarize" />
            </div>
          </>
        )}
      </div>

      {/* ---- Result / loading / error ---- */}
      {state === 'loading' && <SkeletonCard />}

      {state === 'error' && (
        <ErrorCard kind={errorKind} onRetry={doc ? summarizeDoc : summarizePage} />
      )}

      {state === 'done' && result && (
        <div className="glass animate-slide-up p-4">
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-white">
              {result.pageTitle || 'Summary'}
            </h3>
            <button onClick={copySummary} className="chip shrink-0" title="Copy summary">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <RichText text={result.summary} />
        </div>
      )}

      {/* ---- Today at a glance ---- */}
      {state === 'idle' && !isPro && usage && (
        <div className="glass p-4">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
            Today’s free usage
          </h3>
          <div className="space-y-3">
            {Object.keys(limits).map((feature) => (
              <UsageBar key={feature} feature={feature} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
