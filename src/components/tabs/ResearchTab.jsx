import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { explainTerm, generateCitation, getCurrentPage, getSelection } from '../../lib/api';
import ErrorCard from '../ErrorCard';
import LimitBanner from '../LimitBanner';
import RichText from '../RichText';
import { SkeletonLines } from '../Skeleton';
import UsageBar from '../UsageBar';

const CITE_STYLES = ['APA', 'MLA', 'Chicago'];

const PRO_TOOLS = [
  { icon: '📊', name: 'Compare papers', desc: 'Side-by-side multi-paper analysis' },
  { icon: '🧭', name: 'Research gaps', desc: 'Find unexplored angles in a field' },
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
    setCiteState('loading');
    setCitation(null);
    try {
      const page = await getCurrentPage();
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
              <button
                onClick={grabSelection}
                className="btn-ghost shrink-0 px-3"
                title="Use highlighted text from the page"
              >
                ⤵
              </button>
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
              disabled={citeState === 'loading'}
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
        <div className="grid grid-cols-2 gap-2">
          {PRO_TOOLS.map((tool) => (
            <button
              key={tool.name}
              onClick={isPro ? undefined : openUpgrade}
              className="glass-hover group relative rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left"
              title={isPro ? 'Coming in the next build steps' : 'Upgrade to unlock'}
            >
              {!isPro && (
                <span className="absolute right-2 top-2 text-[11px] opacity-60 transition-opacity group-hover:opacity-100">
                  🔒
                </span>
              )}
              <div className="text-lg">{tool.icon}</div>
              <div className="mt-1 text-[12px] font-semibold text-slate-200">{tool.name}</div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{tool.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
