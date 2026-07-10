import React from 'react';
import { LIMIT_HIT_MESSAGE, PRICE_LABEL, PRO_FEATURES } from '../config';
import { openCheckout } from '../lib/checkout';
import Countdown from './Countdown';

/** Shown when a free daily limit is hit, or via any "Upgrade" button. */
export default function UpgradeModal({ onClose }) {

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-slide-up glass mx-3 mb-3 w-full overflow-hidden rounded-3xl border-white/10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Pro"
      >
        {/* Gradient hero */}
        <div className="grad relative px-5 pb-5 pt-6 text-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/35"
          >
            ✕
          </button>
          <div className="mb-1 text-3xl">🚀</div>
          <h2 className="text-lg font-extrabold tracking-tight text-white">
            Unlock ResearchMind Pro
          </h2>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-white/90">
            {LIMIT_HIT_MESSAGE}
          </p>
        </div>

        <div className="max-h-[240px] overflow-y-auto px-5 py-4">
          <ul className="space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-[12.5px] text-slate-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-violet/15 text-[12px]">
                  {f.icon}
                </span>
                {f.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-white/[0.07] px-5 pb-4 pt-3.5">
          <button onClick={openCheckout} className="btn-primary text-[14px]">
            Upgrade to Pro — {PRICE_LABEL}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-slate-500">
            Secure payment via PayPal · Cancel anytime · License key sent by email
          </p>
          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
            <span>Free limits reset in</span>
            <Countdown className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-brand-cyan" />
          </p>
        </div>
      </div>
    </div>
  );
}
