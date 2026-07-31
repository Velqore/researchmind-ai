import React, { useRef, useState } from 'react';
import { useApp } from '../../AppContext';
import { askPaper, getCurrentPage, shareSummary, summarize } from '../../lib/api';
import { downloadMarkdown, downloadWord, exportPdf } from '../../lib/exporters';
import { ACCEPT_ATTR, extractErrorMessage, extractFromFile } from '../../lib/extract';
import { saveSummary } from '../../lib/saved';
import { isWeb } from '../../lib/storage';
import ErrorCard from '../ErrorCard';
import LimitBanner from '../LimitBanner';
import PaperSearch from '../PaperSearch';
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
  const [limitMessage, setLimitMessage] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Chat with this paper
  const [chat, setChat] = useState([]); // [{ role: 'user'|'ai', text }]
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  // Share link
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Uploaded document (PDF / DOCX / TXT / MD), parsed client-side
  const fileInputRef = useRef(null);
  const [doc, setDoc] = useState(null); // { title, text, kind, url }
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);

  /** Summarize a paper from the search results (backend fetches the URL). */
  const summarizePaper = (paper) =>
    runSummarize({ url: paper.pdf || paper.link, title: paper.title, text: '' });

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
    // A new summary invalidates the previous chat/share context.
    setChat([]);
    setQuestion('');
    setShareUrl('');
    setExportMsg('');
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
      const pageTitle = source.title || res.title;
      // Prefer the backend-extracted text (web/link mode); fall back to the
      // client's own text (upload / current-page mode) for chat grounding.
      const srcText = res.source || source.text || '';
      setResult({ ...res, pageTitle, url: source.url, source: srcText });
      setState('done');
      // #4 — auto-save every summary to the local library (fire and forget).
      saveSummary({ title: pageTitle, summary: res.summary, url: source.url, length }).catch(() => {});
    } catch (err) {
      // A daily-limit response is not an outage — show the upgrade prompt.
      if (err?.isLimit) {
        setLimitMessage(err.message);
        setState('limited');
        return;
      }
      // Show the most useful message we can. A 4xx carries a real explanation
      // (paywalled page, scanned PDF, too slow); a timeout/5xx would otherwise
      // surface as a bare "couldn't reach the server", so give an actionable
      // hint pointing at the upload path.
      let msg;
      if (err?.status >= 400 && err?.status < 500) msg = err.message;
      else if (/too long|timed? ?out/i.test(err?.message || '')) msg = err.message;
      else msg = 'Couldn’t reach that source in time. Try another link, or upload the PDF directly.';
      setSourceError(msg);
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

  // #1 — chat with this paper
  const askQuestion = async () => {
    const q = question.trim();
    if (q.length < 3 || asking || !result) return;
    setQuestion('');
    setChat((c) => [...c, { role: 'user', text: q }]);
    setAsking(true);
    try {
      const res = await askPaper({
        question: q,
        text: result.source || '',
        url: result.url || '',
        title: result.pageTitle || '',
        licenseKey: license.key,
      });
      const allowed = await useFeature('ask');
      if (!allowed) {
        // Out of free questions — drop the pending question, upgrade modal shows.
        setChat((c) => c.slice(0, -1));
        return;
      }
      setChat((c) => [...c, { role: 'ai', text: res.answer }]);
    } catch (err) {
      setChat((c) => [
        ...c,
        { role: 'ai', text: err?.isLimit ? err.message : '⚠️ ' + (err?.message || 'Something went wrong.') },
      ]);
    } finally {
      setAsking(false);
    }
  };

  // #9 — create a shareable link
  const doShare = async () => {
    if (!result?.summary || sharing) return;
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
      return;
    }
    setSharing(true);
    try {
      const res = await shareSummary({
        title: result.pageTitle,
        summary: result.summary,
        url: result.url || '',
        licenseKey: license.key,
      });
      setShareUrl(res.share_url);
      await navigator.clipboard.writeText(res.share_url).catch(() => {});
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      setExportMsg(err?.message || 'Couldn’t create share link.');
      setTimeout(() => setExportMsg(''), 3000);
    } finally {
      setSharing(false);
    }
  };

  // #3 — exports
  const flashExport = (msg) => {
    setExportMsg(msg);
    setTimeout(() => setExportMsg(''), 2500);
  };
  const onExportPdf = () => {
    const ok = exportPdf(result.pageTitle, result.summary, result.url);
    if (!ok) flashExport('Allow pop-ups to export as PDF.');
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
                <PaperSearch
                  onSummarizeUrl={(url) => runSummarize({ url, title: '', text: '' })}
                  onSummarizePaper={summarizePaper}
                  busy={state === 'loading'}
                />
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
        <ErrorCard
          kind={errorKind}
          message={sourceError}
          onRetry={doc ? summarizeDoc : summarizePage}
        />
      )}

      {state === 'limited' && (
        <div className="glass animate-slide-up p-4">
          <LimitBanner message={limitMessage} />
        </div>
      )}

      {state === 'done' && result && (
        <div className="glass animate-slide-up p-4">
          <h3 className="mb-2.5 line-clamp-2 pr-1 text-[12.5px] font-semibold leading-snug text-white">
            {result.pageTitle || 'Summary'}
          </h3>
          <RichText text={result.summary} />

          {/* ---- #3 Export / #9 Share row ---- */}
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3">
            <button onClick={copySummary} className="chip" title="Copy summary text">
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <button
              onClick={() => downloadMarkdown(result.pageTitle, result.summary, result.url)}
              className="chip"
              title="Download as Markdown (Notion-ready)"
            >
              ⬇ .md
            </button>
            <button
              onClick={() => downloadWord(result.pageTitle, result.summary, result.url)}
              className="chip"
              title="Download as Word"
            >
              ⬇ Word
            </button>
            <button onClick={onExportPdf} className="chip" title="Export as PDF">
              ⬇ PDF
            </button>
            <button
              onClick={doShare}
              disabled={sharing}
              className="chip ml-auto !bg-brand-violet/15 !text-brand-violet disabled:opacity-60"
              title="Create a public share link"
            >
              {sharing ? '…' : shareUrl ? (shareCopied ? '✓ Link copied' : '🔗 Copy link') : '🔗 Share'}
            </button>
          </div>

          {shareUrl && (
            <div className="animate-fade-in mt-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 bg-transparent text-[10.5px] text-brand-cyan outline-none"
                aria-label="Share link"
              />
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[10.5px] font-medium text-slate-400 hover:text-white"
              >
                Open ↗
              </a>
            </div>
          )}
          {exportMsg && (
            <p className="animate-fade-in mt-2 text-center text-[11px] text-amber-300">{exportMsg}</p>
          )}

          {/* ---- #1 Chat with this paper ---- */}
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[13px]">💬</span>
              <span className="text-[11.5px] font-semibold text-slate-200">Ask this paper</span>
            </div>

            {chat.length > 0 && (
              <div className="mb-2 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {chat.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <span className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-violet/25 px-3 py-1.5 text-[11.5px] text-slate-100">
                        {m.text}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="rounded-2xl rounded-bl-sm border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                    >
                      <RichText text={m.text} />
                    </div>
                  )
                )}
                {asking && (
                  <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-violet/40 border-t-brand-violet" />
                    Reading the paper…
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askQuestion()}
                placeholder="e.g. What was the sample size?"
                spellCheck={false}
                disabled={asking}
                className="input-dark py-2 text-[12px]"
                aria-label="Ask a question about this paper"
              />
              <button
                onClick={askQuestion}
                disabled={asking || question.trim().length < 3}
                className="grad shrink-0 rounded-xl px-3.5 text-[13px] font-bold text-[#1c1204] transition-all duration-150 hover:brightness-105 active:scale-95 disabled:opacity-50"
                aria-label="Send question"
              >
                {asking ? '…' : '➤'}
              </button>
            </div>
            {!isPro && (
              <p className="mt-1.5 text-[10px] text-slate-500">
                {remainingFor('ask')} free question{remainingFor('ask') === 1 ? '' : 's'} left today
              </p>
            )}
          </div>
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
