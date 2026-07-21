import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { PRICE_LABEL } from '../../config';
import { activateKey, deactivate, normalizeKey } from '../../lib/license';
import { isExtension } from '../../lib/storage';

const VERSION = isExtension ? chrome.runtime.getManifest().version : 'dev';

export default function SettingsTab() {
  const { isPro, license, refresh, openUpgrade } = useApp();
  const [keyInput, setKeyInput] = useState('');
  const [state, setState] = useState('idle'); // idle | validating | success | error
  const [error, setError] = useState('');
  const [justUnlocked, setJustUnlocked] = useState(false);

  const handleActivate = async () => {
    setState('validating');
    setError('');
    const res = await activateKey(keyInput);
    if (res.ok) {
      setState('success');
      setJustUnlocked(true);
      setKeyInput('');
      await refresh();
    } else {
      setState('error');
      setError(res.error);
    }
  };

  const handleDeactivate = async () => {
    await deactivate();
    setJustUnlocked(false);
    setState('idle');
    await refresh();
  };

  const expiryLabel = license.expiresAt
    ? new Date(license.expiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const daysLeft = license.expiresAt
    ? Math.max(0, Math.ceil((new Date(license.expiresAt) - Date.now()) / 86400000))
    : null;

  return (
    <div className="space-y-3 py-2">
      {/* ---- Pro status ---- */}
      {isPro ? (
        <div
          className={`glass overflow-hidden p-0 ${justUnlocked ? 'animate-pop' : 'animate-fade-in'}`}
        >
          <div className="grad px-4 py-4 text-center">
            <div className="mb-1 text-3xl">{justUnlocked ? '🎉' : '⭐'}</div>
            <h2 className="text-[15px] font-extrabold text-white">
              {justUnlocked ? 'Pro unlocked!' : 'ResearchMind Pro'}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-white/85">
              Everything unlimited. Thanks for supporting ResearchMind 💜
            </p>
          </div>
          <div className="space-y-2 px-4 py-3.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-slate-400">License key</span>
              <span className="font-mono text-slate-200">
                ••••-••••-••••-{license.key?.slice(-4) ?? '????'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-slate-400">Renews / expires</span>
              <span className="font-semibold text-slate-200">
                {expiryLabel} {daysLeft !== null && <span className="text-slate-500">({daysLeft}d)</span>}
              </span>
            </div>
            <button
              onClick={handleDeactivate}
              className="btn-ghost mt-1 w-full text-[12px] text-slate-400"
            >
              Deactivate on this device
            </button>
          </div>
        </div>
      ) : (
        <div className="glass p-4">
          <div className="mb-2.5 flex items-start justify-between">
            <div>
              <h2 className="text-[13.5px] font-bold text-white">Activate Pro</h2>
              <p className="mt-0.5 text-[11.5px] text-slate-400">
                Paste the license key from your purchase email
              </p>
            </div>
            <span className="text-xl">🔑</span>
          </div>

          <input
            value={keyInput}
            onChange={(e) => {
              setKeyInput(normalizeKey(e.target.value));
              if (state === 'error') setState('idle');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            placeholder="RMND-XXXX-XXXX-XXXX"
            spellCheck={false}
            className="input-dark text-center font-mono uppercase tracking-[0.15em]"
            aria-label="License key"
          />

          {state === 'error' && (
            <p className="animate-fade-in mt-2 text-center text-[11.5px] font-medium text-rose-400">
              {error}
            </p>
          )}

          <button
            onClick={handleActivate}
            disabled={state === 'validating' || keyInput.length < 19}
            className="btn-primary mt-2.5"
          >
            {state === 'validating' ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Validating…
              </>
            ) : (
              'Activate license'
            )}
          </button>

          <div className="mt-3 border-t border-white/[0.07] pt-3 text-center">
            <p className="text-[11.5px] text-slate-500">Don’t have a key yet?</p>
            <button
              onClick={openUpgrade}
              className="mt-1 text-[12px] font-semibold text-brand-violet hover:text-brand-purple hover:underline"
            >
              Get Pro for {PRICE_LABEL} →
            </button>
          </div>
        </div>
      )}

      {/* ---- About ---- */}
      <div className="glass p-4">
        <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          About
        </h2>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Version</span>
            <span className="font-medium text-slate-200">{VERSION}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Plan</span>
            <span className={`font-semibold ${isPro ? 'text-amber-300' : 'text-slate-200'}`}>
              {isPro ? '⭐ Pro' : 'Free'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Free limits reset</span>
            <span className="font-medium text-slate-200">Midnight (local time)</span>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <a
            href="https://www.paypal.com/myaccount/autopay/"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost flex-1 text-center text-[11.5px]"
          >
            Manage subscription
          </a>
          <a
            href="mailto:researchmindai@gmail.com?subject=ResearchMind%20Support"
            className="btn-ghost flex-1 text-center text-[11.5px]"
          >
            Support
          </a>
        </div>
      </div>
    </div>
  );
}
