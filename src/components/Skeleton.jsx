import React from 'react';

/** Shimmering skeleton block shown while the AI is working. */
export function SkeletonLines({ lines = 4 }) {
  const widths = ['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-2/3', 'w-full'];
  return (
    <div className="animate-fade-in space-y-2.5" aria-label="Loading" role="status">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass animate-fade-in p-4">
      <div className="skeleton mb-3 h-4 w-1/3" />
      <SkeletonLines lines={5} />
    </div>
  );
}
