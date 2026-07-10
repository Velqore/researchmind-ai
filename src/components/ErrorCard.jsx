import React from 'react';

const MESSAGES = {
  offline: {
    icon: '📡',
    title: 'You’re offline',
    body: 'ResearchMind needs an internet connection to reach the AI. Reconnect and try again — your daily limit wasn’t used.',
  },
  server: {
    icon: '🛠️',
    title: 'Couldn’t reach the server',
    body: 'The ResearchMind backend didn’t respond. Please try again in a moment — your daily limit wasn’t used.',
  },
  page: {
    icon: '🚫',
    title: 'Can’t read this page',
    body: 'This page (e.g. Chrome settings or the Web Store) can’t be accessed by extensions. Open a regular article or paper and try again.',
  },
};

export default function ErrorCard({ kind = 'server', onRetry }) {
  const m = MESSAGES[kind] ?? MESSAGES.server;
  return (
    <div className="glass animate-scale-in border-amber-400/20 p-4 text-center" role="alert">
      <div className="mb-1 text-2xl">{m.icon}</div>
      <h3 className="text-[13.5px] font-semibold text-white">{m.title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{m.body}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost mt-3 w-full">
          Try again
        </button>
      )}
    </div>
  );
}
