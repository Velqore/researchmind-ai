import React from 'react';

const TABS = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'research', icon: '🔍', label: 'Research' },
  { id: 'writer', icon: '✍️', label: 'Writer' },
  { id: 'library', icon: '📚', label: 'Library' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="border-t border-white/[0.07] bg-ink-950/70 px-2 py-1.5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-200 ${
                isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span
                className={`text-[17px] transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'opacity-60 group-hover:opacity-90'
                }`}
              >
                {tab.icon}
              </span>
              <span
                className={`text-[9.5px] font-semibold tracking-wide ${
                  isActive ? 'grad-text' : 'text-slate-500 group-hover:text-slate-400'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="grad absolute -top-[7px] h-[3px] w-8 rounded-full shadow-glow-sm" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
