import React from 'react';
import { useApp } from '../AppContext';
import { isExtension } from '../lib/storage';
import Logo from './Logo';

const isFullPage =
  typeof document !== 'undefined' && document.documentElement.classList.contains('full-page');

export default function Header({ onOpenSettings }) {
  const { isPro, openUpgrade } = useApp();

  const openFullView = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1') });
  };

  return (
    <header className="flex items-center justify-between px-4 pb-2 pt-3.5">
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <div className="leading-tight">
          <h1 className="text-[15px] font-bold tracking-tight text-white">
            ResearchMind <span className="grad-text">AI</span>
          </h1>
          <p className="text-[10.5px] font-medium text-slate-400">Your AI research copilot</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
      {isExtension && !isFullPage && (
        <button
          onClick={openFullView}
          title="Open in full page"
          aria-label="Open in full page"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[13px] text-slate-400 transition-all duration-150 hover:border-white/20 hover:text-white"
        >
          ⤢
        </button>
      )}

      {isPro ? (
        <button
          onClick={onOpenSettings}
          className="animate-pop flex items-center gap-1 rounded-full border border-amber-300/30 bg-gradient-to-r from-amber-400/20 to-yellow-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 shadow-glow-sm"
          title="Pro active — view details in Settings"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
          </svg>
          PRO
        </button>
      ) : (
        <button
          onClick={openUpgrade}
          className="grad animate-pulse-glow rounded-full px-3 py-1.5 text-[11px] font-bold text-white transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          ⚡ Upgrade
        </button>
      )}
      </div>
    </header>
  );
}
