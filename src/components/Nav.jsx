import React from 'react';
import { navigate, useRoute } from '../router';

export const ROUTES = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/research', icon: '🔍', label: 'Research' },
  { path: '/writer', icon: '✍️', label: 'Writer', pro: true },
  { path: '/library', icon: '📚', label: 'Library' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

const isActive = (route, path) =>
  route.path === '/' ? path === '/' : path.startsWith(route.path);

/** variant: 'side' (desktop left rail) | 'bottom' (mobile bar). */
export default function Nav({ variant = 'side' }) {
  const path = useRoute();

  if (variant === 'bottom') {
    return (
      <nav className="border-t border-white/[0.07] bg-ink-950/70 px-2 py-1.5 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between">
          {ROUTES.map((r) => {
            const active = isActive(r, path);
            return (
              <button
                key={r.path}
                onClick={() => navigate(r.path)}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-200 ${
                  active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className={`text-[17px] transition-transform duration-200 ${active ? 'scale-110' : 'opacity-60 group-hover:opacity-90'}`}>
                  {r.icon}
                </span>
                <span className={`text-[9.5px] font-semibold tracking-wide ${active ? 'grad-text' : 'text-slate-500 group-hover:text-slate-400'}`}>
                  {r.label}
                </span>
                {active && <span className="grad absolute -top-[7px] h-[3px] w-8 rounded-full shadow-glow-sm" />}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Desktop left rail
  return (
    <nav className="hidden w-[210px] shrink-0 flex-col gap-1 border-r border-white/[0.07] bg-ink-950/40 p-3 md:flex">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <span className="text-[19px]">📚</span>
        <span className="text-[15px] font-bold text-white">
          ResearchMind <span className="grad-text">AI</span>
        </span>
      </div>
      {ROUTES.map((r) => {
        const active = isActive(r, path);
        return (
          <button
            key={r.path}
            onClick={() => navigate(r.path)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-200 ${
              active ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span className="text-[16px]">{r.icon}</span>
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
    </nav>
  );
}
