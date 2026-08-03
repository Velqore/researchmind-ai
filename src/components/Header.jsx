import React from 'react';
import { useApp } from '../AppContext';
import { isExtension } from '../lib/storage';
import { navigate } from '../router';
import Logo from './Logo';

const isFullPage =
  typeof document !== 'undefined' && document.documentElement.classList.contains('full-page');

export default function Header({ onMenu }) {
  const { isPro, openUpgrade, creditsLeft } = useApp();

  const openFullView = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1') });
  };

  return (
    <header className="flex items-center justify-between border-b border-white/[0.05] px-4 pb-2.5 pt-3.5 md:px-8">
      {/* Brand + hamburger — hidden on desktop where the sidebar shows them. */}
      <div className="flex items-center gap-2.5 md:hidden">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Logo size={32} />
        <h1 className="font-display text-[15px] font-bold tracking-tight text-[#f5edda]">
          ResearchMind <span className="grad-text">AI</span>
        </h1>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-1.5">
        {!isPro && (
          <button
            onClick={openUpgrade}
            title="Daily credits left — tap to go unlimited"
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
          >
            <span className="text-brand-cyan">◆</span>
            {(creditsLeft ?? 0).toLocaleString()}
            <span className="hidden text-slate-500 sm:inline">credits</span>
          </button>
        )}
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
          onClick={() => navigate('/settings')}
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
          className="grad animate-pulse-glow rounded-full px-3 py-1.5 text-[11px] font-bold text-[#1c1204] transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          ⚡ Upgrade
        </button>
      )}
      </div>
    </header>
  );
}
