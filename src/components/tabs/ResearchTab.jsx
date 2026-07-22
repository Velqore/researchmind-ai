import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { explainTerm, generateCitation, getCurrentPage, getSelection, proTool } from '../../lib/api';
import { isWeb } from '../../lib/storage';
import ErrorCard from '../ErrorCard';
import LimitBanner from '../LimitBanner';
import RichText from '../RichText';
import { SkeletonLines } from '../Skeleton';
import UploadButton from '../UploadButton';
import UsageBar from '../UsageBar';

const CITE_STYLES = ['APA', 'MLA', 'Chicago'];

// Every Pro tool is live and backed by real AI, grounded in the user's own
// pasted text (no fabricated citations). `mode` drives the input UI:
//   papers  — one or more paper textareas
//   text    — a single textarea
//   topic   — a short single-line topic input
//   ask     — a paper textarea + a question field
//   translate — a text textarea + a language field
const PRO_TOOLS = [
  { id: 'compare', icon: '📊', name: 'Compare papers', desc: 'Side-by-side multi-paper analysis', mode: 'papers', min: 2, cta: 'Compare papers', run: 'Comparing…' },
  { id: 'research_gap', icon: '🧭', name: 'Research gaps', desc: 'Find unexplored angles in a paper', mode: 'papers', min: 1, cta: 'Find research gaps', run: 'Analyzing…' },
  { id: 'bibliography', icon: '📖', name: 'Auto bibliography', desc: 'Format sources into a reference list', mode: 'papers', min: 1, cta: 'Build bibliography', run: 'Building…' },
  { id: 'litreview', icon: '📝', name: 'Lit review draft', desc: 'First-draft literature review', mode: 'papers', min: 1, cta: 'Draft review', run: 'Drafting…' },
  { id: 'flashcards', icon: '🃏', name: 'Flashcards', desc: 'Study cards from any text', mode: 'text', ph: 'Paste text to turn into flashcards…', cta: 'Make flashcards', run: 'Generating…' },
  { id: 'mindmap', icon: '🕸️', name: 'Mind map', desc: 'Outline a topic or paper as a map', mode: 'text', ph: 'Paste a topic or text…', cta: 'Build mind map', run: 'Mapping…' },
  { id: 'tables', icon: '📋', name: 'Extract tables', desc: 'Pull tabular data from text', mode: 'text', ph: 'Paste text containing tables/data…', cta: 'Extract tables', run: 'Extracting…' },
  { id: 'related', icon: '🔗', name: 'Related work', desc: 'Directions & search queries', mode: 'text', ph: 'Paste an abstract or topic…', cta: 'Find directions', run: 'Searching…' },
  { id: 'youtube', icon: '🎥', name: 'Lecture notes', desc: 'Notes from a video transcript', mode: 'text', ph: 'Paste the lecture/video transcript…', cta: 'Summarize lecture', run: 'Summarizing…' },
  { id: 'askpaper', icon: '💬', name: 'Ask a paper', desc: 'Ask questions about a paper', mode: 'ask', ph: 'Paste the paper text…', cta: 'Ask', run: 'Reading…' },
  { id: 'translate', icon: '🌐', name: 'Translate', desc: 'Any text, 50+ languages', mode: 'translate', ph: 'Paste text to translate…', cta: 'Translate', run: 'Translating…' },
  { id: 'digest', icon: '📚', name: 'Topic briefing', desc: 'Study guide for any topic', mode: 'topic', ph: 'e.g. diffusion models', cta: 'Build briefing', run: 'Preparing…' },
];

export default function ResearchTab() {
  const { isPro, license, remainingFor, useFeature, openUpgrade } = useApp();

  // --- Term explainer ---
  const [term, setTerm] = useState('');
  const [explainState, setExplainState] = useState('idle');
  const [explanation, setExplanation] = useState(null);

  // --- Citation generator ---
  const [style, setStyle] = useState('APA');
  const [citeUrl, setCiteUrl] = useState(''); // web mode: user provides the link
  const [citeText, setCiteText] = useState(''); // uploaded/pasted paper content
  const [citeFileName, setCiteFileName] = useState('');
  const [citeConcept, setCiteConcept] = useState(''); // specific quote/concept to cite
  const [citeState, setCiteState] = useState('idle');
  const [citation, setCitation] = useState(null);
  const [citeCopied, setCiteCopied] = useState(false);

  const explainLeft = remainingFor('explain');
  const citeLeft = remainingFor('cite');

  const grabSelection = async () => {
    const sel = await getSelection();
    if (sel) setTerm(sel.slice(0, 120));
  };

  const handleExplain = async () => {
    if (!term.trim()) return;
    if (!navigator.onLine) {
      setExplainState('offline');
      return;
    }
    setExplainState('loading');
    setExplanation(null);
    try {
      const res = await explainTerm({ term: term.trim(), context: '', licenseKey: license.key });
      const allowed = await useFeature('explain');
      if (!allowed) {
        setExplainState('idle');
        return;
      }
      setExplanation(res.explanation);
      setExplainState('done');
    } catch {
      setExplainState('error');
    }
  };

  const handleCite = async () => {
    if (!navigator.onLine) {
      setCiteState('offline');
      return;
    }
    let page = { url: '', title: '' };
    const haveFile = citeText.trim().length > 20;
    if (isWeb && !haveFile) {
      const url = citeUrl.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) return;
      page = { url, title: '' };
    }
    setCiteState('loading');
    setCitation(null);
    try {
      if (!isWeb && !haveFile) page = await getCurrentPage();
      const res = await generateCitation({
        url: page.url,
        title: page.title || citeFileName,
        style,
        text: citeText,
        concept: citeConcept,
        licenseKey: license.key,
      });
      const allowed = await useFeature('cite');
      if (!allowed) {
        setCiteState('idle');
        return;
      }
      setCitation(res.citation);
      setCiteState('done');
    } catch {
      setCiteState('error');
    }
  };

  const copyCitation = async () => {
    await navigator.clipboard.writeText(citation);
    setCiteCopied(true);
    setTimeout(() => setCiteCopied(false), 1500);
  };

  // --- Pro tools (config-driven; all live) ---
  const [tool, setTool] = useState(null); // the active PRO_TOOLS entry, or null
  const [papers, setPapers] = useState(['', '']);
  const [toolText, setToolText] = useState('');
  const [toolOption, setToolOption] = useState(''); // language or question
  const [toolState, setToolState] = useState('idle'); // idle | loading | done | error
  const [toolResult, setToolResult] = useState('');

  const openTool = (t) => {
    if (!isPro) return openUpgrade();
    setTool(t);
    setPapers(t.mode === 'papers' ? (t.min >= 2 ? ['', ''] : ['']) : ['']);
    setToolText('');
    setToolOption(t.mode === 'translate' ? 'Hindi' : '');
    setToolState('idle');
    setToolResult('');
  };

  const runTool = async () => {
    if (!tool) return;
    let payload = { tool: tool.id, licenseKey: license.key };
    if (tool.mode === 'papers') {
      const filled = papers.map((p) => p.trim()).filter(Boolean);
      if (filled.length < (tool.min || 1)) return;
      payload.papers = filled;
    } else {
      if (!toolText.trim()) return;
      payload.text = toolText;
      if (tool.mode === 'translate' || tool.mode === 'ask') payload.option = toolOption;
    }
    setToolState('loading');
    setToolResult('');
    try {
      const res = await proTool(payload);
      setToolResult(res.result);
      setToolState('done');
    } catch (err) {
      setToolResult(err.message || 'Something went wrong. Please try again.');
      setToolState('error');
    }
  };

  return (
    <div className="space-y-3 py-2">
      {/* ---- Term explainer ---- */}
      <div className="glass p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div>
            <h2 className="text-[13.5px] font-bold text-white">Explain a term</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              Decode jargon — highlight text on the page or type it
            </p>
          </div>
          <span className="text-xl">🔍</span>
        </div>

        {!isPro && explainLeft === 0 ? (
          <LimitBanner message="You've used all your free term explanations today. Unlock unlimited access for just ₹140 for 6 months 🚀" />
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
                placeholder="e.g. stochastic gradient descent"
                className="input-dark"
                aria-label="Term to explain"
              />
              {!isWeb && (
                <button
                  onClick={grabSelection}
                  className="btn-ghost shrink-0 px-3"
                  title="Use highlighted text from the page"
                >
                  ⤵
                </button>
              )}
            </div>
            <button
              onClick={handleExplain}
              disabled={explainState === 'loading' || !term.trim()}
              className="btn-primary mt-2.5"
            >
              {explainState === 'loading' ? 'Explaining…' : 'Explain it simply'}
            </button>
            <div className="mt-3">
              <UsageBar feature="explain" />
            </div>
          </>
        )}

        {explainState === 'loading' && (
          <div className="mt-3">
            <SkeletonLines lines={3} />
          </div>
        )}
        {(explainState === 'error' || explainState === 'offline') && (
          <div className="mt-3">
            <ErrorCard kind={explainState === 'offline' ? 'offline' : 'server'} onRetry={handleExplain} />
          </div>
        )}
        {explainState === 'done' && explanation && (
          <div className="animate-slide-up mt-3 rounded-xl border border-brand-violet/20 bg-brand-violet/[0.07] p-3">
            <RichText text={explanation} />
          </div>
        )}
      </div>

      {/* ---- Citation generator ---- */}
      <div className="glass p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div>
            <h2 className="text-[13.5px] font-bold text-white">Cite this page</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">APA · MLA · Chicago</p>
          </div>
          <span className="text-xl">📎</span>
        </div>

        {!isPro && citeLeft === 0 ? (
          <LimitBanner message="You've used all your free citations today. Unlock unlimited access for just ₹140 for 6 months 🚀" />
        ) : (
          <>
            {isWeb && !citeText && (
              <input
                value={citeUrl}
                onChange={(e) => setCiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCite()}
                placeholder="Paste a link — the page is read for an accurate citation…"
                spellCheck={false}
                className="input-dark mb-2"
                aria-label="Link to cite"
              />
            )}

            {/* upload a paper to cite it accurately */}
            {citeText ? (
              <div className="animate-scale-in mb-2 flex items-center gap-2 rounded-xl border border-brand-violet/25 bg-brand-violet/[0.08] p-2.5">
                <span className="text-base">📄</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-200">
                  {citeFileName || 'Uploaded paper'}
                </span>
                <button
                  onClick={() => {
                    setCiteText('');
                    setCiteFileName('');
                  }}
                  aria-label="Remove file"
                  className="shrink-0 px-1 text-[13px] text-slate-500 hover:text-rose-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="mb-2.5">
                <UploadButton
                  label="Upload paper to cite"
                  onText={(text, title) => {
                    setCiteText(text);
                    setCiteFileName(title || 'Uploaded paper');
                  }}
                />
              </div>
            )}

            <div className="mb-2.5 flex gap-1.5" role="radiogroup" aria-label="Citation style">
              {CITE_STYLES.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={style === s}
                  onClick={() => setStyle(s)}
                  className={`chip ${style === s ? 'chip-active' : ''}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* cite a specific quote/concept from the source */}
            <input
              value={citeConcept}
              onChange={(e) => setCiteConcept(e.target.value)}
              placeholder="Optional: a specific quote or concept to cite…"
              className="input-dark mb-2.5"
              aria-label="Specific concept to cite"
            />

            <button
              onClick={handleCite}
              disabled={
                citeState === 'loading' || (isWeb && !citeText && !citeUrl.trim())
              }
              className="btn-primary"
            >
              {citeState === 'loading' ? 'Analyzing source…' : `Generate ${style} citation`}
            </button>
            <div className="mt-3">
              <UsageBar feature="cite" />
            </div>
          </>
        )}

        {citeState === 'loading' && (
          <div className="mt-3">
            <SkeletonLines lines={2} />
          </div>
        )}
        {(citeState === 'error' || citeState === 'offline') && (
          <div className="mt-3">
            <ErrorCard kind={citeState === 'offline' ? 'offline' : 'server'} onRetry={handleCite} />
          </div>
        )}
        {citeState === 'done' && citation && (
          <div className="animate-slide-up mt-3 rounded-xl border border-brand-blue/20 bg-brand-blue/[0.07] p-3">
            {citation.includes('**') ? (
              <RichText text={citation} />
            ) : (
              <p className="break-words font-mono text-[11.5px] leading-relaxed text-slate-200">
                {citation}
              </p>
            )}
            <button onClick={copyCitation} className="chip mt-2.5">
              {citeCopied ? '✓ Copied' : 'Copy citation'}
            </button>
          </div>
        )}
      </div>

      {/* ---- Pro tools ---- */}
      <div className="glass p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          Pro research tools
          <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
            PRO
          </span>
        </h2>

        {tool ? (
          /* ---- Live tool panel ---- */
          <div className="animate-fade-in">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[13.5px] font-bold text-white">
                {tool.icon} {tool.name}
              </h3>
              <button onClick={() => setTool(null)} className="chip" aria-label="Back to tools">
                ← Back
              </button>
            </div>
            <p className="mb-2.5 text-[11.5px] text-slate-400">{tool.desc}</p>

            {/* --- inputs by mode --- */}
            {tool.mode === 'papers' && (
              <>
                <div className="space-y-2">
                  {papers.map((p, idx) => (
                    <textarea
                      key={idx}
                      value={p}
                      onChange={(e) => {
                        const next = [...papers];
                        next[idx] = e.target.value;
                        setPapers(next);
                      }}
                      placeholder={`Source ${idx + 1} — paste abstract or text…`}
                      rows={3}
                      className="input-dark resize-none"
                      aria-label={`Source ${idx + 1}`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {papers.length < 4 && (
                    <button onClick={() => setPapers([...papers, ''])} className="chip">
                      ＋ Add another
                    </button>
                  )}
                  <UploadButton
                    label="Upload paper"
                    onText={(text) => {
                      setPapers((prev) => {
                        const idx = prev.findIndex((p) => !p.trim());
                        if (idx >= 0) {
                          const next = [...prev];
                          next[idx] = text;
                          return next;
                        }
                        return prev.length < 4 ? [...prev, text] : prev;
                      });
                    }}
                  />
                </div>
              </>
            )}

            {tool.mode === 'topic' && (
              <input
                value={toolText}
                onChange={(e) => setToolText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runTool()}
                placeholder={tool.ph}
                className="input-dark"
                aria-label={tool.name}
              />
            )}

            {(tool.mode === 'text' || tool.mode === 'ask' || tool.mode === 'translate') && (
              <>
                <textarea
                  value={toolText}
                  onChange={(e) => setToolText(e.target.value)}
                  placeholder={tool.ph}
                  rows={5}
                  className="input-dark resize-none"
                  aria-label={tool.name}
                />
                <div className="mt-2">
                  <UploadButton label="Upload file instead" onText={(text) => setToolText(text)} />
                </div>
              </>
            )}

            {tool.mode === 'ask' && (
              <input
                value={toolOption}
                onChange={(e) => setToolOption(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runTool()}
                placeholder="Your question about the paper…"
                className="input-dark mt-2"
                aria-label="Question"
              />
            )}

            {tool.mode === 'translate' && (
              <input
                value={toolOption}
                onChange={(e) => setToolOption(e.target.value)}
                placeholder="Target language, e.g. Hindi, Spanish, French"
                className="input-dark mt-2"
                aria-label="Target language"
              />
            )}

            <button onClick={runTool} disabled={toolState === 'loading'} className="btn-primary mt-2.5">
              {toolState === 'loading' ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black/80" />
                  {tool.run}
                </>
              ) : (
                <>
                  {tool.icon} {tool.cta}
                </>
              )}
            </button>

            {toolState === 'loading' && (
              <div className="mt-3">
                <SkeletonLines lines={4} />
              </div>
            )}
            {toolState === 'error' && (
              <p className="animate-fade-in mt-2.5 text-center text-[11.5px] font-medium text-rose-400">
                {toolResult}
              </p>
            )}
            {toolState === 'done' && toolResult && (
              <div className="animate-slide-up mt-3 max-h-[280px] overflow-y-auto rounded-xl border border-brand-violet/20 bg-brand-violet/[0.07] p-3">
                <RichText text={toolResult} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {PRO_TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => openTool(t)}
                className="glass-hover group relative rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left"
                title={isPro ? t.name : 'Upgrade to unlock'}
              >
                {!isPro && (
                  <span className="absolute right-2 top-2 text-[11px] opacity-60 transition-opacity group-hover:opacity-100">
                    🔒
                  </span>
                )}
                <div className="text-lg">{t.icon}</div>
                <div className="mt-1 text-[12px] font-semibold text-slate-200">{t.name}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{t.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
