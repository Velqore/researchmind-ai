import React from 'react';
import { useApp } from '../AppContext';
import { LIMIT_HIT_MESSAGE } from '../config';
import Countdown from './Countdown';

/** Inline banner shown in place of a feature when its daily limit is exhausted. */
export default function LimitBanner({ message = LIMIT_HIT_MESSAGE }) {
  const { openUpgrade } = useApp();
  return (
    <div className="glass animate-scale-in border-rose-400/20 bg-rose-500/[0.06] p-4 text-center">
      <div className="mb-1 text-2xl">⏳</div>
      <p className="text-[12.5px] leading-relaxed text-slate-200">{message}</p>
      <div className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-slate-400">
        <span>Resets in</span>
        <Countdown className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[12px] font-bold text-brand-cyan" />
      </div>
      <button onClick={openUpgrade} className="btn-primary mt-3.5">
        ⚡ Upgrade to Pro — $1.50/month
      </button>
    </div>
  );
}
