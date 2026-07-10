import React from 'react';

/** ResearchMind AI mark — animated knowledge-graph spark.
 *  Nodes breathe in a staggered rhythm, energy flows along the edges,
 *  and the whole mark gently tilts on hover. Animations live in index.css. */
export default function Logo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="logo-mark"
    >
      <defs>
        <linearGradient id="rm-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#rm-grad)" />
      <g stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9">
        <line className="logo-edge" x1="24" y1="24" x2="13" y2="14" />
        <line className="logo-edge" x1="24" y1="24" x2="35" y2="13" />
        <line className="logo-edge" x1="24" y1="24" x2="36" y2="31" />
        <line className="logo-edge" x1="24" y1="24" x2="15" y2="35" />
      </g>
      <circle className="logo-core" cx="24" cy="24" r="6" fill="white" />
      <circle className="logo-node" cx="13" cy="14" r="3.2" fill="white" opacity="0.95" />
      <circle className="logo-node" cx="35" cy="13" r="2.6" fill="white" opacity="0.85" />
      <circle className="logo-node" cx="36" cy="31" r="3" fill="white" opacity="0.9" />
      <circle className="logo-node" cx="15" cy="35" r="2.4" fill="white" opacity="0.8" />
    </svg>
  );
}
