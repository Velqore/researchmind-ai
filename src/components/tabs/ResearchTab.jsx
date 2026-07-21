import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import {
  comparePapers,
  explainTerm,
  findResearchGaps,
  generateCitation,
  getCurrentPage,
  getSelection,
} from '../../lib/api';
import { isWeb } from '../../lib/storage';
import ErrorCard from '../ErrorCard';
import LimitBanner from '../LimitBanner';
import RichText from '../RichText';
import { SkeletonLines } from '../Skeleton';
import UsageBar from '../UsageBar';

const CITE_STYLES = ['APA', 'MLA', 'Chicago'];

// Live Pro tools have a working backend and open the multi-paper panel.
const PRO_TOOLS = [
  { id: 'compare', icon: '📊', name: 'Compare papers', desc: 'Side-by-side multi-paper analysis', live: true },
  { id: 'gaps', icon: '🧭', name: 'Research gaps', desc: 'Find unexplored angles in a field', live: true },
  { icon: '📖', name: 'Auto bibliography', desc: 'Build a full reference list' },
  { icon: '🎥', name: 'YouTube lectures', desc: 'Summarize any lecture video' },
  { icon: '💬', name: 'Chat with PDF', desc: 'Ask questions to any paper' },
  { icon: '📰', name: 'Daily digest', desc: 'Google Scholar updates on your topic' },
  { icon: '🃏', name: 'Flashcards', desc: 'Auto-generate study cards from papers' },
  { icon: '🕸️', name: 'Mind maps', desc: 'Visualize a topic or paper as a map' },
  { icon: '📝', name: 'Lit review draft', desc: 'First-draft literature reviews' },
  { icon: '🔗', name: 'Related papers', desc: 'Discover connected research' },
  { icon: '📋', name: 'Extract tables', desc: 'Pull tables & figures from PDFs' },
  { icon: '🌐', name: 'Translate', desc: 'Read papers in 50+ languages' },
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
    let page;
    if (isWeb) {
      const url = citeUrl.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) return;
      page = { url, title: '' };
    }
    setCiteState('loading');
    setCitation(null);
    try {
      if (!isWeb) page = await getCurrentPage();
      const res = await generateCitation({
        url: page.url,
        title: page.title,
        style,
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

  // --- Pro multi-paper tools (Compare / Research gaps) ---
  const [tool, setTool] = useState(null); // 'compare' | 'gaps' | null
  const [papers, setPapers] = useState(['', '']);
  const [toolState, setToolState] = useState('idle'); // idle | loading | done | error
  const [toolResult, setToolResult] = useState('');
  const [soon, setSoon] = useState('');

  const openTool = (t) => {
    if (!isPro) return openUpgrade();
    if (!t.live) {
      setSoon(t.name);
      setTimeout(() => setSoon(''), 2200);
      return;
    }
    setTool(t.id);
    setPapers(t.id === 'gaps' ? [''] : ['', '']);
    setToolState('idle');
    setToolResult('');
  };

  const runTool = async () => {
    const filled = papers.map((p) => p.trim()).filter(Boolean);
    const min = tool === 'gaps' ? 1 : 2;
    if (filled.length < min) return;
    setToolState('loading');
    setToolResult('');
    try {
      const res =
        tool === 'gaps'
          ? await findResearchGaps({ papers: filled, licenseKey: license.key })
          : await comparePapers({ papers: filled, licenseKey: license.key });
      setToolResult(tool === 'gaps' ? res.gaps : res.comparison);
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
          <LimitBanner message="You've used all your free term explanations today. Unlock unlimited access for just $1.40 for 6 months 🚀" />
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
          <LimitBanner message="You've used all your free citations today. Unlock unlimited access for just $1.40 for 6 months 🚀" />
        ) : (
          <>
            {isWeb && (
              <input
                value={citeUrl}
                onChange={(e) => setCiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCite()}
                placeholder="Paste the link to cite…"
                spellCheck={false}
                className="input-dark mb-2.5"
                aria-label="Link to cite"
              />
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
            <button
              onClick={handleCite}
              disabled={citeState === 'loading' || (isWeb && !citeUrl.trim())}
              className="btn-primary"
            >
              {citeState === 'loading' ? 'Generating…' : `Generate ${style} citation`}
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
            <p className="break-words font-mono text-[11.5px] leading-relaxed text-slate-200">
              {citation}
            </p>
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
          /* ---- Live tool panel (Compare / Research gaps) ---- */
          <div className="animate-fade-in">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[13.5px] font-bold text-white">
                {tool === 'gaps' ? '🧭 Research gaps' : '📊 Compare papers'}
              </h3>
              <button
                onClick={() => setTool(null)}
                className="chip"
                aria-label="Back to tools"
              >
                ← Back
              </button>
            </div>
            <p className="mb-2.5 text-[11.5px] text-slate-400">
              {tool === 'gaps'
                ? 'Paste one or more papers (abstract or full text) to surface open questions.'
                : 'Paste two or more papers to compare their methods and findings.'}
            </p>

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
                  placeholder={`Paper ${idx + 1} — paste abstract or text…`}
                  rows={3}
                  className="input-dark resize-none"
                  aria-label={`Paper ${idx + 1}`}
                />
              ))}
            </div>

            {papers.length < 4 && (
              <button onClick={() => setPapers([...papers, ''])} className="chip mt-2">
                ＋ Add another paper
              </button>
            )}

            <button
              onClick={runTool}
              disabled={toolState === 'loading'}
              className="btn-primary mt-2.5"
            >
              {toolState === 'loading' ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black/80" />
                  Analyzing…
                </>
              ) : tool === 'gaps' ? (
                '🧭 Find research gaps'
              ) : (
                '📊 Compare papers'
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
              <div className="animate-slide-up mt-3 rounded-xl border border-brand-violet/20 bg-brand-violet/[0.07] p-3">
                <RichText text={toolResult} />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {PRO_TOOLS.map((t) => (
                <button
                  key={t.name}
                  onClick={() => openTool(t)}
                  className="glass-hover group relative rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left"
                  title={t.live ? t.name : isPro ? 'Coming soon' : 'Upgrade to unlock'}
                >
                  {!isPro && (
                    <span className="absolute right-2 top-2 text-[11px] opacity-60 transition-opacity group-hover:opacity-100">
                      🔒
                    </span>
                  )}
                  {t.live && (
                    <span className="absolute right-2 top-2 rounded bg-emerald-400/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-300">
                      Live
                    </span>
                  )}
                  <div className="text-lg">{t.icon}</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-200">{t.name}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{t.desc}</div>
                </button>
              ))}
            </div>
            {soon && (
              <p className="animate-fade-in mt-3 text-center text-[11.5px] font-medium text-brand-cyan">
                “{soon}” is coming soon — Compare papers &amp; Research gaps are live now ✨
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
