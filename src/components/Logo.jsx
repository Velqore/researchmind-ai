import React from 'react';

/** ResearchMind AI mark — "Midnight Observatory".
 *  A Konark Sun Temple wheel (a carved stone sundial) with a lotus core and
 *  the ringed geometry of Jaipur's Jantar Mantar. The wheel turns slowly like
 *  a chariot of the sun; the lotus counter-rotates and breathes; a light sheen
 *  travels the rim. Animations live in index.css (.rm-*). */
export default function Logo({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="rm-logo"
    >
      <defs>
        <radialGradient id="rm-hub" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6e0" />
          <stop offset="55%" stopColor="#f4d99a" />
          <stop offset="100%" stopColor="#c69a4c" />
        </radialGradient>
        <linearGradient id="rm-petal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4d99a" />
          <stop offset="1" stopColor="#c69a4c" />
        </linearGradient>
        <linearGradient id="rm-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4d99a" />
          <stop offset="1" stopColor="#b6873f" />
        </linearGradient>
        <radialGradient id="rm-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(227,189,118,.5)" />
          <stop offset="70%" stopColor="rgba(227,189,118,.12)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <g id="rm-spoke">
          <path d="M60 34 L62.4 56 L57.6 56 Z" fill="url(#rm-rim)" />
          <circle cx="60" cy="37.5" r="2.2" fill="#fff6e0" />
        </g>
        <g id="rm-pt">
          <path d="M60 60 Q55.5 49 60 40 Q64.5 49 60 60 Z" fill="url(#rm-petal)" />
        </g>
      </defs>

      <circle cx="60" cy="60" r="46" fill="url(#rm-halo)" className="rm-halo" />

      {/* sun-wheel — rotates slowly */}
      <g className="rm-spin">
        <circle cx="60" cy="60" r="45" stroke="url(#rm-rim)" strokeWidth="2.2" fill="none" />
        <circle cx="60" cy="60" r="41" stroke="#c69a4c" strokeWidth=".7" fill="none" opacity=".7" />
        <circle cx="60" cy="60" r="24" stroke="url(#rm-rim)" strokeWidth="1.6" fill="none" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <use key={a} href="#rm-spoke" transform={`rotate(${a} 60 60)`} />
        ))}
        {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) => (
          <line
            key={a}
            x1="60"
            y1="36"
            x2="60"
            y2="56"
            stroke="#c69a4c"
            strokeWidth=".9"
            opacity=".6"
            transform={`rotate(${a} 60 60)`}
          />
        ))}
        <circle
          className="rm-sheen"
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="#fff6e0"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="16 267"
          opacity=".9"
        />
      </g>

      {/* lotus core — counter-rotates + breathes */}
      <g className="rm-spin-rev">
        <g className="rm-breathe">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <use key={a} href="#rm-pt" transform={`rotate(${a} 60 60)`} />
          ))}
        </g>
      </g>
      <circle cx="60" cy="60" r="6" fill="url(#rm-hub)" />
      <circle cx="60" cy="60" r="2.4" fill="#fff6e0" />
    </svg>
  );
}
