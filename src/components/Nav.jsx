import React from 'react';
import { navigate, useRoute } from '../router';
import Logo from './Logo';

export const ROUTES = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/research', icon: '🔍', label: 'Research' },
  { path: '/writer', icon: '✍️', label: 'Writer', pro: true },
  { path: '/library', icon: '📚', label: 'Library' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

const isActive = (route, path) =>
  route.path === '/' ? path === '/' : path.startsWith(route.path);

/** variant: 'side' (desktop left rail, hidden on mobile) | 'drawer' (mobile
 *  slide-in panel). `onNavigate` fires after a link is tapped so the drawer can
 *  close itself. */
export default function Nav({ variant = 'side', onNavigate }) {
  const path = useRoute();
  const go = (p) => {
    navigate(p);
    onNavigate?.();
  };

  const wrap =
    variant === 'drawer'
      ? 'flex h-full w-[248px] flex-col gap-1 p-3'
      : 'hidden w-[220px] shrink-0 flex-col gap-1 border-r border-white/[0.07] bg-ink-950/40 p-3 md:flex';

  return (
    <nav className={wrap} aria-label="Main navigation">
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <Logo size={32} />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight text-[#f5edda]">
            ResearchMind <span className="grad-text">AI</span>
          </div>
          <div className="text-[8.5px] font-medium uppercase tracking-[0.16em] text-gold-deep/80">
            AI Research Copilot
          </div>
        </div>
      </div>

      {ROUTES.map((r) => {
        const active = isActive(r, path);
        return (
          <button
            key={r.path}
            onClick={() => go(r.path)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-200 ${
              active
                ? 'bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span className={`text-[16px] transition-transform ${active ? 'scale-110' : ''}`}>
              {r.icon}
            </span>
            <span className="flex-1">{r.label}</span>
            {r.pro && (
              <span className="rounded-md bg-brand-violet/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-violet">
                Pro
              </span>
            )}
            {active && <span className="grad h-1.5 w-1.5 rounded-full" />}
          </button>
        );
      })}

      <div className="mt-auto px-2 pt-3 text-[9.5px] text-slate-600">v1.0 · researchmind.ai</div>
    </nav>
  );
}
