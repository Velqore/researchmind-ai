import React from 'react';
import { useApp } from '../AppContext';
import { DAILY_LIMITS, FEATURE_LABELS } from '../config';

/** Daily-limit progress bar for one feature. Green→violet→amber→red as it fills. */
export default function UsageBar({ feature, compact = false }) {
  const { usage, isPro } = useApp();

  if (isPro) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
        <span>∞</span>
        <span className="text-slate-400 font-medium">Unlimited with Pro</span>
      </div>
    );
  }

  const max = DAILY_LIMITS[feature];
  const used = usage?.counts?.[feature] ?? 0;
  const left = Math.max(0, max - used);
  const pct = Math.min(100, (used / max) * 100);

  const barColor =
    left === 0
      ? 'bg-gradient-to-r from-rose-500 to-red-500'
      : pct >= 60
        ? 'bg-gradient-to-r from-amber-400 to-orange-500'
        : 'bg-gradient-to-r from-brand-violet to-brand-blue';

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-400">{FEATURE_LABELS[feature]}</span>
          <span className={`font-semibold ${left === 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {left}/{max} left today
          </span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemax={max}
        aria-label={`${FEATURE_LABELS[feature]}: ${left} of ${max} left today`}
      >
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
