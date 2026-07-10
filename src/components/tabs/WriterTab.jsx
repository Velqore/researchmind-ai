import React, { useState } from 'react';
import { useApp } from '../../AppContext';

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
];

export default function WriterTab() {
  const { isPro, openUpgrade } = useApp();
  const [active, setActive] = useState('humanize');
  const [input, setInput] = useState('');
  const tool = TOOLS.find((t) => t.id === active);

  return (
    <div className="space-y-3 py-2">
      <div className="flex gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
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
            <button className="btn-primary mt-2.5" disabled={!input.trim()}>
              {tool.icon} {tool.cta}
            </button>
            <p className="mt-2 text-center text-[10.5px] text-slate-500">
              This Pro tool goes live with the backend in the upcoming build steps.
            </p>
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
              ⚡ Unlock for $1.50/month
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
