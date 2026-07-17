import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { PRICE_LABEL } from '../../config';
import { rewriteText } from '../../lib/api';
import { SkeletonLines } from '../Skeleton';

const TOOLS = [
  {
    id: 'humanize',
    icon: '✨',
    name: 'AI Text Humanizer',
    desc: 'Make AI-written text sound natural, warm and human.',
    placeholder: 'Paste AI-generated text to humanize…',
    cta: 'Humanize text',
  },
  {
    id: 'paraphrase',
    icon: '🔄',
    name: 'Plagiarism Remover',
    desc: 'Rewrite passages in your own voice while keeping the meaning.',
    placeholder: 'Paste text to paraphrase…',
    cta: 'Paraphrase text',
  },
  {
    id: 'polish',
    icon: '🧹',
    name: 'Grammar Polish',
    desc: 'Fix grammar and sharpen clarity without changing your voice.',
    placeholder: 'Paste text to polish…',
    cta: 'Polish text',
  },
];

export default function WriterTab() {
  const { isPro, license, openUpgrade } = useApp();
  const [active, setActive] = useState('humanize');
  const [input, setInput] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const tool = TOOLS.find((t) => t.id === active);

  const switchTool = (id) => {
    setActive(id);
    setState('idle');
    setOutput('');
    setError('');
  };

  const run = async () => {
    if (!input.trim()) return;
    setState('loading');
    setOutput('');
    setError('');
    try {
      const res = await rewriteText({ mode: active, text: input, licenseKey: license.key });
      setOutput(res.result);
      setState('done');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setState('error');
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 py-2">
      <div className="flex gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTool(t.id)}
            className={`chip flex-1 justify-center py-2 ${active === t.id ? 'chip-active' : ''}`}
          >
            {t.icon} {t.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="glass p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-white">
              {tool.name}
              <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                PRO
              </span>
            </h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">{tool.desc}</p>
          </div>
          <span className="text-xl">{tool.icon}</span>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tool.placeholder}
          rows={5}
          disabled={!isPro}
          className="input-dark resize-none disabled:opacity-60"
          aria-label={tool.name}
        />

        {isPro ? (
          <>
            <button
              onClick={run}
              className="btn-primary mt-2.5"
              disabled={!input.trim() || state === 'loading'}
            >
              {state === 'loading' ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Rewriting…
                </>
              ) : (
                <>
                  {tool.icon} {tool.cta}
                </>
              )}
            </button>

            {state === 'loading' && (
              <div className="mt-3">
                <SkeletonLines lines={4} />
              </div>
            )}

            {state === 'error' && (
              <p className="animate-fade-in mt-2.5 text-center text-[11.5px] font-medium text-rose-400">
                {error}
              </p>
            )}

            {state === 'done' && output && (
              <div className="animate-slide-up mt-3 rounded-xl border border-brand-violet/20 bg-brand-violet/[0.07] p-3">
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-200">
                  {output}
                </p>
                <button onClick={copyOutput} className="chip mt-2.5">
                  {copied ? '✓ Copied' : 'Copy result'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="animate-fade-in mt-3 rounded-xl border border-brand-violet/25 bg-gradient-to-br from-brand-violet/[0.12] to-brand-blue/[0.08] p-4 text-center">
            <div className="mb-1 text-2xl">🔒</div>
            <p className="text-[12.5px] font-semibold text-white">Writer tools are Pro-only</p>
            <p className="mx-auto mt-1 max-w-[280px] text-[11.5px] leading-relaxed text-slate-400">
              Humanize AI text and remove plagiarism with unlimited rewrites — plus every other Pro
              feature.
            </p>
            <button onClick={openUpgrade} className="btn-primary mt-3">
              ⚡ Unlock for {PRICE_LABEL}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
