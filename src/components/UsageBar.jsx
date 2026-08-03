import React from 'react';
import { useApp } from '../AppContext';

/** Daily credit balance meter. The whole free tier draws from one pool, so this
 *  shows the shared balance regardless of which feature it's placed next to. */
export default function UsageBar({ compact = false }) {
  const { isPro, creditsLeft, creditsMax } = useApp();

  if (isPro) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
        <span>∞</span>
        <span className="font-medium text-slate-400">Unlimited with Pro</span>
      </div>
    );
  }

  const left = creditsLeft ?? 0;
  const max = creditsMax || 100;
  const usedPct = Math.min(100, ((max - left) / max) * 100);
  const low = left <= max * 0.15;

  const barColor = low
    ? 'bg-gradient-to-r from-rose-500 to-red-500'
    : usedPct >= 60
      ? 'bg-gradient-to-r from-amber-400 to-orange-500'
      : 'bg-gradient-to-r from-brand-violet to-brand-blue';

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-400">Daily credits</span>
          <span className={`font-semibold ${low ? 'text-rose-400' : 'text-slate-300'}`}>
            {left.toLocaleString()} / {max.toLocaleString()} left
          </span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuenow={left}
        aria-valuemax={max}
        aria-label={`${left} of ${max} daily credits left`}
      >
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${100 - usedPct}%` }}
        />
      </div>
    </div>
  );
}
