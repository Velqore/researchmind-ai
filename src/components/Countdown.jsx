import React, { useEffect, useState } from 'react';
import { formatCountdown, msUntilMidnight } from '../lib/limits';

/** Live HH:MM:SS countdown to local midnight, when free limits reset. */
export default function Countdown({ className = '' }) {
  const [ms, setMs] = useState(msUntilMidnight());

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={`font-mono tabular-nums ${className}`} title="Free limits reset at midnight">
      {formatCountdown(ms)}
    </span>
  );
}
