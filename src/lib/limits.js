// Free-tier daily limit engine backed by chrome.storage.local.
// Limits reset at LOCAL midnight: usage is stamped with the local date key,
// and any read on a new day lazily resets the counters.

import { DAILY_LIMITS } from '../config';
import { KEYS, storageGet, storageSet } from './storage';

export function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function freshUsage() {
  return {
    date: todayKey(),
    counts: { summarize: 0, explain: 0, cite: 0, highlight: 0 },
  };
}

/** Read usage, resetting counters if the local date rolled over. */
export async function getUsage() {
  const stored = await storageGet(KEYS.USAGE);
  if (!stored || stored.date !== todayKey()) {
    const reset = freshUsage();
    await storageSet(KEYS.USAGE, reset);
    return reset;
  }
  return stored;
}

export function remaining(usage, feature) {
  const used = usage?.counts?.[feature] ?? 0;
  return Math.max(0, DAILY_LIMITS[feature] - used);
}

/**
 * Consume one use of a feature. Returns the updated usage object, or null if
 * the feature has no uses left (callers should then show the upgrade prompt).
 * Pro users never consume — call sites skip this when isPro is true.
 */
export async function consume(feature) {
  const usage = await getUsage();
  if (remaining(usage, feature) <= 0) return null;
  const updated = {
    ...usage,
    counts: { ...usage.counts, [feature]: (usage.counts[feature] ?? 0) + 1 },
  };
  await storageSet(KEYS.USAGE, updated);
  return updated;
}

/** Milliseconds until the next LOCAL midnight (when limits reset). */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
